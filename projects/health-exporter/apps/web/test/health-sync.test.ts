import { beforeEach, describe, expect, it } from "vitest";
import { MemoryHealthRepository } from "../src/domain/repository.ts";
import { makeHealthSyncService } from "../src/domain/service.ts";
import { makeHealthSyncHandler, makeSyncStatusHandler } from "../src/http/health-sync.ts";

const secret = "a-personal-secret-long-enough-for-tests";
const validBody = {
  requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
  deviceId: "42eaa184-e6cd-42af-aae8-160ecd461157",
  samples: [
    {
      sampleId: "df9dd8e9-470a-477c-b22a-f13fd853ce89",
      type: "stepCount",
      value: 412,
      unit: "count",
      startAt: "2026-09-18T08:00:00.000Z",
      endAt: "2026-09-18T09:00:00.000Z",
      source: { bundleIdentifier: "com.apple.health", name: "Health" },
    },
  ],
};

describe("personal health sync HTTP handlers", () => {
  let repository: MemoryHealthRepository;
  let post: ReturnType<typeof makeHealthSyncHandler>;
  let status: ReturnType<typeof makeSyncStatusHandler>;

  beforeEach(() => {
    repository = new MemoryHealthRepository();
    const service = makeHealthSyncService(repository, secret);
    post = makeHealthSyncHandler(service);
    status = makeSyncStatusHandler(service);
  });

  it("requires the exact personal bearer secret", async () => {
    expect((await post(request(validBody))).status).toBe(401);
    expect((await post(request(validBody, "wrong-secret-that-is-long-enough"))).status).toBe(401);
  });

  it("ingests step samples idempotently and reports status", async () => {
    const accepted = await post(request(validBody, secret));
    const replayed = await post(request(validBody, secret));
    expect(await accepted.json()).toMatchObject({ status: "accepted", inserted: 1 });
    expect(await replayed.json()).toMatchObject({ status: "replayed", inserted: 1 });
    expect(repository.samples).toHaveLength(1);
    const response = await status(
      new Request("https://health.example/api/v1/sync-status", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(await response.json()).toMatchObject({
      deviceId: validBody.deviceId,
      totalSamples: 1,
      lastSync: { requestId: validBody.requestId, acceptedSamples: 1 },
    });
  });

  it("rejects altered replay, future samples, long intervals, and oversized bodies", async () => {
    await post(request(validBody, secret));
    expect(
      (
        await post(
          request({ ...validBody, samples: [{ ...validBody.samples[0], value: 999 }] }, secret),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await post(
          request(
            {
              ...validBody,
              requestId: crypto.randomUUID(),
              samples: [{ ...validBody.samples[0], endAt: "2099-01-01T00:00:00.000Z" }],
            },
            secret,
          ),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await post(
          request(
            {
              ...validBody,
              requestId: crypto.randomUUID(),
              samples: [{ ...validBody.samples[0], endAt: "2026-09-18T10:01:00.000Z" }],
            },
            secret,
          ),
        )
      ).status,
    ).toBe(422);
    const tooLarge = new Request("https://health.example/api/v1/health-sync", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-length": "65537" },
      body: "{}",
    });
    expect((await post(tooLarge)).status).toBe(413);
    const chunkedTooLarge = new Request("https://health.example/api/v1/health-sync", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      body: "x".repeat(65_537),
    });
    expect((await post(chunkedTooLarge)).status).toBe(413);
  });
});

function request(body: unknown, token?: string) {
  return new Request("https://health.example/api/v1/health-sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
