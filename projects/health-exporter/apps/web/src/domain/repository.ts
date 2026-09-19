import type {
  HealthSyncRequestV1,
  HealthSyncResponseV1,
  StepSampleV1,
  SyncStatusV1,
} from "../contracts/v1.ts";

export type HealthRepository = {
  readonly ingest: (input: HealthSyncRequestV1) => Promise<HealthSyncResponseV1>;
  readonly status: () => Promise<SyncStatusV1>;
};

export class RequestIdConflict extends Error {}

export class MemoryHealthRepository implements HealthRepository {
  readonly samples = new Map<string, StepSampleV1>();
  private readonly runs = new Map<
    string,
    { hash: string; response: HealthSyncResponseV1; receivedAt: string; deviceId: string }
  >();

  async ingest(input: HealthSyncRequestV1): Promise<HealthSyncResponseV1> {
    const key = `${input.deviceId}:${input.requestId}`;
    const hash = await hashCanonicalPayload(input);
    const old = this.runs.get(key);
    if (old !== undefined) {
      if (old.hash !== hash) {
        throw new RequestIdConflict();
      }
      return { ...old.response, status: "replayed" };
    }
    let inserted = 0;
    for (const sample of input.samples) {
      const sampleKey = `${input.deviceId}:${sample.sampleId}`;
      if (!this.samples.has(sampleKey)) {
        this.samples.set(sampleKey, sample);
        inserted += 1;
      }
    }
    const response: HealthSyncResponseV1 = {
      requestId: input.requestId,
      status: "accepted",
      inserted,
      unchanged: input.samples.length - inserted,
    };
    this.runs.set(key, {
      hash,
      response,
      receivedAt: new Date().toISOString(),
      deviceId: input.deviceId,
    });
    return response;
  }

  status(): Promise<SyncStatusV1> {
    const last = [...this.runs.values()].at(-1);
    return Promise.resolve({
      deviceId: last?.deviceId ?? null,
      totalSamples: this.samples.size,
      lastSync:
        last === undefined
          ? null
          : {
              requestId: last.response.requestId,
              acceptedSamples: last.response.inserted + last.response.unchanged,
              receivedAt: last.receivedAt,
            },
    });
  }
}

export async function hashCanonicalPayload(input: HealthSyncRequestV1): Promise<string> {
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
  const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
