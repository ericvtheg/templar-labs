import type {
  HealthSampleV1,
  SampleIngestionRequestV1,
  SampleIngestionResponseV1,
} from "../contracts/v1.ts";

export type DeviceRecord = {
  readonly id: string;
  readonly installationId: string;
  readonly tokenHash: string;
  readonly revokedAt: Date | null;
};

export type StoredSample = HealthSampleV1 & {
  readonly deletedAt: string | null;
};

export type IngestionRepository = {
  readonly findDeviceByTokenHash: (tokenHash: string) => Promise<DeviceRecord | null>;
  readonly ingest: (
    device: DeviceRecord,
    input: SampleIngestionRequestV1,
  ) => Promise<SampleIngestionResponseV1>;
};

export class IngestionRequestConflict extends Error {
  readonly _tag = "IngestionRequestConflict";
}

export class IngestionClaimUnauthorized extends Error {
  readonly _tag = "IngestionClaimUnauthorized";
}

export class MemoryIngestionRepository implements IngestionRepository {
  readonly devices = new Map<string, DeviceRecord>();
  readonly samples = new Map<string, StoredSample>();
  readonly tombstones = new Map<string, string>();
  readonly responses = new Map<string, SampleIngestionResponseV1>();
  readonly payloadHashes = new Map<string, string>();

  findDeviceByTokenHash(tokenHash: string) {
    return Promise.resolve(
      [...this.devices.values()].find((device) => device.tokenHash === tokenHash) ?? null,
    );
  }

  async ingest(device: DeviceRecord, input: SampleIngestionRequestV1) {
    const replayKey = `${device.id}:${input.requestId}`;
    const payloadHash = await hashCanonicalPayload(input);
    const previous = this.responses.get(replayKey);
    if (previous !== undefined) {
      if (this.payloadHashes.get(replayKey) !== payloadHash) {
        throw new IngestionRequestConflict();
      }
      return { ...previous, status: "replayed" as const };
    }

    let inserted = 0;
    let unchanged = 0;
    let deleted = 0;
    for (const deletion of input.deletions) {
      const key = `${device.id}:${deletion.sampleId}`;
      const oldDeletion = this.tombstones.get(key);
      if (oldDeletion === undefined || deletion.deletedAt > oldDeletion) {
        this.tombstones.set(key, deletion.deletedAt);
      }
      const existing = this.samples.get(key);
      if (existing !== undefined && existing.deletedAt === null) {
        this.samples.set(key, { ...existing, deletedAt: deletion.deletedAt });
        deleted += 1;
      } else {
        if (
          existing !== undefined &&
          existing.deletedAt !== null &&
          deletion.deletedAt > existing.deletedAt
        ) {
          this.samples.set(key, { ...existing, deletedAt: deletion.deletedAt });
        }
        unchanged += 1;
      }
    }
    for (const sample of input.samples) {
      const key = `${device.id}:${sample.sampleId}`;
      if (this.tombstones.has(key) || this.samples.has(key)) {
        unchanged += 1;
      } else {
        this.samples.set(key, { ...sample, deletedAt: null });
        inserted += 1;
      }
    }
    const response = {
      requestId: input.requestId,
      status: "accepted" as const,
      inserted,
      unchanged,
      deleted,
    };
    this.responses.set(replayKey, response);
    this.payloadHashes.set(replayKey, payloadHash);
    return response;
  }
}

export async function hashCanonicalPayload(input: SampleIngestionRequestV1): Promise<string> {
  const canonical = canonicalJson(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
