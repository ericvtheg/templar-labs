import { beforeEach, describe, expect, it } from "vitest";
import { MemoryIngestionRepository } from "../domain/repository.ts";
import { hashDeviceToken, makeIngestionService } from "../domain/service.ts";
import { makeSampleIngestionHandler } from "./sample-ingestion.ts";

const token = "test-device-token-that-is-at-least-32-chars";
const deviceId = "1d259a9a-e621-4dd8-8c8a-700b236244d0";
const installationId = "42eaa184-e6cd-42af-aae8-160ecd461157";
const sampleId = "df9dd8e9-470a-477c-b22a-f13fd853ce89";

const validSample = {
  sampleId,
  type: "bodyMass",
  value: 82_350,
  unit: "g",
  startAt: "2026-07-24T08:00:00.000Z",
  endAt: "2026-07-24T08:00:00.000Z",
  source: {
    bundleIdentifier: "com.weightgurus.app",
    name: "Weight Gurus",
    version: "1.0",
    metadata: { syncIdentifier: "wg-123" },
  },
};

const validBody = {
  requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
  device: { deviceId, installationId, platform: "ios", appVersion: "0.1.0" },
  anchor: "opaque-healthkit-anchor",
  samples: [validSample],
  deletions: [],
};

describe("POST /api/v1/sample-ingestion", () => {
  let repository: MemoryIngestionRepository;
  let handler: ReturnType<typeof makeSampleIngestionHandler>;

  beforeEach(async () => {
    repository = new MemoryIngestionRepository();
    repository.devices.set(deviceId, {
      id: deviceId,
      installationId,
      tokenHash: await hashDeviceToken(token),
      revokedAt: null,
    });
    handler = makeSampleIngestionHandler(makeIngestionService(repository));
  });

  it("rejects missing and invalid authentication", async () => {
    const missing = await handler(makeRequest(validBody));
    const invalid = await handler(makeRequest(validBody, "wrong-token-that-is-at-least-32-chars"));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("accepts a valid sample and preserves source provenance", async () => {
    const response = await handler(makeRequest(validBody, token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "accepted",
      inserted: 1,
      unchanged: 0,
    });
    expect(repository.samples.get(`${deviceId}:${sampleId}`)?.source).toEqual(
      validBody.samples[0]?.source,
    );
  });

  it("returns the stored outcome without duplicating a replayed request", async () => {
    await handler(makeRequest(validBody, token));
    const replay = await handler(makeRequest(validBody, token));

    await expect(replay.json()).resolves.toMatchObject({
      status: "replayed",
      inserted: 1,
    });
    expect(repository.samples).toHaveLength(1);
  });

  it("returns 409 when a request ID is reused with a different payload", async () => {
    await handler(makeRequest(validBody, token));
    const response = await handler(
      makeRequest(
        {
          ...validBody,
          samples: [{ ...validSample, value: validSample.value + 1 }],
        },
        token,
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "request_id_conflict" });
    expect(repository.samples.get(`${deviceId}:${sampleId}`)?.value).toBe(82_350);
  });

  it("rejects invalid payloads before reaching the domain", async () => {
    const invalid = { ...validBody, samples: [{ ...validBody.samples[0], unit: "lb" }] };
    const response = await handler(makeRequest(invalid, token));

    expect(response.status).toBe(422);
    expect(repository.samples).toHaveLength(0);
  });

  it("rejects oversized bodies before JSON parsing", async () => {
    const response = await handler(
      new Request("https://health.example/api/v1/sample-ingestion", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-length": "1048577",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
  });

  it("bounds source metadata and rejects duplicate sample IDs", async () => {
    const excessiveMetadata = {
      ...validBody,
      samples: [
        {
          ...validBody.samples[0],
          source: {
            ...validBody.samples[0]?.source,
            metadata: Object.fromEntries(
              Array.from({ length: 33 }, (_, index) => [`key-${index}`, "value"]),
            ),
          },
        },
      ],
    };
    const duplicate = {
      ...validBody,
      samples: [validBody.samples[0], validBody.samples[0]],
    };

    expect((await handler(makeRequest(excessiveMetadata, token))).status).toBe(422);
    expect((await handler(makeRequest(duplicate, token))).status).toBe(422);
  });

  it("tombstones deletions and prevents stale reconciliation from resurrecting data", async () => {
    await handler(makeRequest(validBody, token));
    const deletion = {
      ...validBody,
      requestId: "031ec45d-2810-405c-84f7-e7db5b1e790e",
      samples: [],
      deletions: [{ sampleId, deletedAt: "2026-07-25T08:00:00.000Z" }],
    };
    const deletionResponse = await handler(makeRequest(deletion, token));
    const reconciliation = {
      ...validBody,
      requestId: "b56fb6f8-ff6d-4805-9a9b-9f0d0bf68239",
    };
    const reconciliationResponse = await handler(makeRequest(reconciliation, token));

    await expect(deletionResponse.json()).resolves.toMatchObject({ deleted: 1 });
    await expect(reconciliationResponse.json()).resolves.toMatchObject({
      inserted: 0,
      unchanged: 1,
    });
    expect(repository.samples.get(`${deviceId}:${sampleId}`)?.deletedAt).toBe(
      "2026-07-25T08:00:00.000Z",
    );
  });

  it("does not regress a tombstone when an older deletion arrives later", async () => {
    const newer = {
      ...validBody,
      requestId: "031ec45d-2810-405c-84f7-e7db5b1e790e",
      samples: [],
      deletions: [{ sampleId, deletedAt: "2026-07-25T08:00:00.000Z" }],
    };
    const older = {
      ...newer,
      requestId: "84d72100-dd74-43ff-b428-98eab960f5d7",
      deletions: [{ sampleId, deletedAt: "2026-07-24T08:00:00.000Z" }],
    };

    await handler(makeRequest(newer, token));
    await handler(makeRequest(older, token));

    expect(repository.tombstones.get(`${deviceId}:${sampleId}`)).toBe("2026-07-25T08:00:00.000Z");
  });
});

function makeRequest(body: unknown, bearer?: string) {
  return new Request("https://health.example/api/v1/sample-ingestion", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(body),
  });
}
