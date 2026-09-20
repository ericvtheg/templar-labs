// oxlint-disable eslint/no-await-in-loop -- ordered uploads must finish before their HealthKit checkpoint advances.
export type ArchiveRecord = { id: string; parentId: string; data: unknown };
export type HealthPage = {
  records: ArchiveRecord[];
  deleted: string[];
  anchor: string;
  hasMore: boolean;
};
export type HealthReader = {
  requestPermissions(): Promise<void>;
  getTypes(): Promise<{ id: string; name: string }[]>;
  readPage(type: string, anchor: string | null): Promise<HealthPage>;
};
export type ArchiveStatus = {
  protocol: number;
  totalRecords: number;
  types: { type: string; count: number }[];
  checkpoints: Record<string, string>;
};
export type Destination = { url: string; secret: string; deviceId: string };

export function validateDestination(url: string, secret: string): string {
  const parsed = new URL(url.trim());
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Enter an HTTPS destination URL without credentials, query parameters, or a fragment.",
    );
  }
  if (!/^[\w.~-]{32,512}$/.test(secret)) {
    throw new Error("Paste the complete access key from Proton Pass.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function request(
  destination: Destination,
  fetcher: typeof fetch,
  body?: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetcher(
      `${destination.url}/api/v2/health-archive?deviceId=${encodeURIComponent(destination.deviceId)}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${destination.secret}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "The destination rejected the access key."
          : `Destination returned HTTP ${response.status}. Saved progress is preserved.`,
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function archiveStatus(
  destination: Destination,
  fetcher = fetch,
): Promise<ArchiveStatus> {
  const status = (await request(destination, fetcher)) as ArchiveStatus;
  if (status.protocol !== 2 || !status.checkpoints || !Number.isFinite(status.totalRecords)) {
    throw new Error("This destination does not support full-history exports (protocol v2).");
  }
  return status;
}

// Bound each request by item count and encoded size. Native series and archives
// arrive as separate records with a shared parent ID.
export function batches(records: ArchiveRecord[]): ArchiveRecord[][] {
  const result: ArchiveRecord[][] = [];
  let current: ArchiveRecord[] = [];
  let bytes = 0;
  for (const record of records) {
    const size = JSON.stringify(record).length * 3; // Conservative UTF-8 bound for UTF-16 code units.
    if (size > 1_500_000) {
      throw new Error(
        "A HealthKit record is too large to send safely. Its progress has not advanced.",
      );
    }
    if (current.length >= 100 || bytes + size > 1_500_000) {
      result.push(current);
      current = [];
      bytes = 0;
    }
    current.push(record);
    bytes += size;
  }
  if (current.length) {
    result.push(current);
  }
  return result;
}

export async function exportHealth(options: {
  destination: Destination;
  reader: HealthReader;
  fetcher?: typeof fetch;
  fromBeginning?: boolean;
  paused: () => boolean;
  progress: (message: string) => void;
}) {
  const { destination, reader, paused, progress } = options;
  const fetcher = options.fetcher ?? fetch;
  const status = await archiveStatus(destination, fetcher);
  await reader.requestPermissions();
  const types = await reader.getTypes();
  const errors: string[] = [];
  let sent = 0;
  let completed = 0;
  for (const [index, type] of types.entries()) {
    let anchor: string | null = options.fromBeginning ? null : status.checkpoints[type.id] || null;
    let more = true;
    while (more) {
      if (paused()) {
        return { paused: true, sent, completed, errors };
      }
      progress(
        `${index + 1}/${types.length}: ${displayType(type.name)}\n${sent.toLocaleString()} records sent this session.`,
      );
      let page: HealthPage;
      try {
        page = await reader.readPage(type.id, anchor);
      } catch (error) {
        errors.push(
          `${displayType(type.name)}: ${error instanceof Error ? error.message : "HealthKit could not read this type"}`,
        );
        break;
      }
      for (const records of batches(page.records)) {
        if (paused()) {
          return { paused: true, sent, completed, errors };
        }
        await request(destination, fetcher, {
          deviceId: destination.deviceId,
          type: type.id,
          records,
          deleted: [],
        });
        sent += records.length;
        progress(
          `${index + 1}/${types.length}: ${displayType(type.name)}\n${sent.toLocaleString()} records sent this session.`,
        );
      }
      // Commit only after every chunk in the HealthKit page was acknowledged.
      await request(destination, fetcher, {
        deviceId: destination.deviceId,
        type: type.id,
        records: [],
        deleted: page.deleted,
        checkpoint: page.anchor,
      });
      if (page.hasMore && page.anchor === anchor) {
        throw new Error(
          "HealthKit returned a repeated checkpoint. Export stopped without skipping records.",
        );
      }
      anchor = page.anchor;
      more = page.hasMore;
      if (!more) {
        completed += 1;
      }
    }
  }
  return { paused: false, sent, completed, errors };
}

export function displayType(identifier: string): string {
  return identifier
    .replace(
      /^HK(?:QuantityTypeIdentifier|CategoryTypeIdentifier|ClinicalTypeIdentifier|CorrelationTypeIdentifier|DataTypeIdentifier|DocumentTypeIdentifier)/,
      "",
    )
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}
