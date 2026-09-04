import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SampleIngestionRequestV1 } from "../contracts/v1.ts";
import type { DeviceRecord } from "../domain/repository.ts";
import { IngestionClaimUnauthorized, IngestionRequestConflict } from "../domain/repository.ts";
import { makeD1IngestionRepository } from "./d1-repository.ts";

const device: DeviceRecord = {
  id: "1d259a9a-e621-4dd8-8c8a-700b236244d0",
  installationId: "42eaa184-e6cd-42af-aae8-160ecd461157",
  tokenHash: "hash",
  revokedAt: null,
};
const sampleId = "df9dd8e9-470a-477c-b22a-f13fd853ce89";

describe("D1 ingestion repository", () => {
  let miniflare: Miniflare;
  let binding: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-05-15",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    });
    binding = (await miniflare.getD1Database("DB")) as D1Database;
    const migration = await readFile(
      new URL("../../../../db/migrations/0000_health_exporter.sql", import.meta.url),
      "utf8",
    );
    await binding.batch(
      migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
        .map((statement) => binding.prepare(statement)),
    );
    await binding
      .prepare(
        `INSERT INTO health_devices
         (id, owner_id, installation_id, display_name, platform, token_hash, token_hint, created_at)
         VALUES (?, 'owner', ?, 'test', 'ios', ?, 'hint', ?)`,
      )
      .bind(device.id, device.installationId, device.tokenHash, Date.now())
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("atomically claims concurrent identical request IDs and replays exact counters", async () => {
    const repository = makeD1IngestionRepository(binding);
    const input = request({
      requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
      samples: [sample()],
    });

    const results = await Promise.all([
      repository.ingest(device, input),
      repository.ingest(device, input),
    ]);

    expect(results.map((result) => result.status).toSorted()).toEqual(["accepted", "replayed"]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inserted: 1, unchanged: 0 }),
        expect.objectContaining({ inserted: 1, unchanged: 0 }),
      ]),
    );
    await expect(count(binding, "health_samples")).resolves.toBe(1);
    await expect(count(binding, "health_sync_runs")).resolves.toBe(1);
  });

  it("rejects concurrent reuse of a request ID for a different canonical payload", async () => {
    const repository = makeD1IngestionRepository(binding);
    const requestId = "68da8ab4-4488-42e9-bb80-49d8b84edbd1";
    const first = request({ requestId, samples: [sample()] });
    const second = request({
      requestId,
      samples: [{ ...sample(), value: sample().value + 1 }],
    });

    const results = await Promise.allSettled([
      repository.ingest(device, first),
      repository.ingest(device, second),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({ reason: expect.any(IngestionRequestConflict) });
    await expect(count(binding, "health_sync_runs")).resolves.toBe(1);
    await expect(count(binding, "health_samples")).resolves.toBe(1);
  });

  it("canonicalizes object key order when identifying a replay", async () => {
    const repository = makeD1IngestionRepository(binding);
    const inputSample = sample();
    const input = request({
      requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
      samples: [
        {
          ...inputSample,
          source: { ...inputSample.source, metadata: { zebra: "last", alpha: "first" } },
        },
      ],
    });
    const reordered = {
      ...input,
      samples: [
        {
          ...inputSample,
          source: { ...inputSample.source, metadata: { alpha: "first", zebra: "last" } },
        },
      ],
    };

    await expect(repository.ingest(device, input)).resolves.toMatchObject({ status: "accepted" });
    await expect(repository.ingest(device, reordered)).resolves.toMatchObject({
      status: "replayed",
      inserted: 1,
    });
  });

  it("rejects a stale authorization when the device is revoked at claim time", async () => {
    const repository = makeD1IngestionRepository(binding);
    await binding
      .prepare("UPDATE health_devices SET revoked_at = ? WHERE id = ?")
      .bind(Date.now(), device.id)
      .run();

    await expect(
      repository.ingest(
        device,
        request({
          requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
          samples: [sample()],
        }),
      ),
    ).rejects.toBeInstanceOf(IngestionClaimUnauthorized);
    await expect(count(binding, "health_sync_runs")).resolves.toBe(0);
    await expect(count(binding, "health_samples")).resolves.toBe(0);
  });

  it("rolls back a claimed request when a later batch statement fails", async () => {
    const requestId = "68da8ab4-4488-42e9-bb80-49d8b84edbd1";
    await expect(
      binding.batch([
        binding
          .prepare(
            `INSERT INTO health_sync_runs
             (id, device_id, request_id, payload_hash, sample_count, deletion_count, inserted_count,
              unchanged_count, deleted_count, received_at, completed_at)
             VALUES ('claim', ?, ?, 'hash', 1, 0, 0, 0, 0, 0, 0)`,
          )
          .bind(device.id, requestId),
        binding.prepare("INSERT INTO table_that_does_not_exist (id) VALUES (1)"),
      ]),
    ).rejects.toThrow();

    await expect(count(binding, "health_sync_runs")).resolves.toBe(0);
  });

  it("serializes deletion and ingest without resurrection", async () => {
    const repository = makeD1IngestionRepository(binding);
    const deletion = request({
      requestId: "031ec45d-2810-405c-84f7-e7db5b1e790e",
      deletions: [{ sampleId, deletedAt: "2026-07-25T08:00:00.000Z" }],
    });
    const ingestion = request({
      requestId: "b56fb6f8-ff6d-4805-9a9b-9f0d0bf68239",
      samples: [sample()],
    });

    await Promise.all([repository.ingest(device, deletion), repository.ingest(device, ingestion)]);

    await expect(count(binding, "health_deletion_tombstones")).resolves.toBe(1);
    const stored = await binding
      .prepare("SELECT count(*) AS count FROM health_samples WHERE deleted_at IS NULL")
      .first<{ count: number }>();
    expect(stored?.count).toBe(0);
  });

  it("never regresses a tombstone or soft-deletion timestamp", async () => {
    const repository = makeD1IngestionRepository(binding);
    await repository.ingest(
      device,
      request({
        requestId: "b56fb6f8-ff6d-4805-9a9b-9f0d0bf68239",
        samples: [sample()],
      }),
    );
    await repository.ingest(
      device,
      request({
        requestId: "031ec45d-2810-405c-84f7-e7db5b1e790e",
        deletions: [{ sampleId, deletedAt: "2026-07-25T08:00:00.000Z" }],
      }),
    );
    await repository.ingest(
      device,
      request({
        requestId: "84d72100-dd74-43ff-b428-98eab960f5d7",
        deletions: [{ sampleId, deletedAt: "2026-07-24T08:00:00.000Z" }],
      }),
    );

    const tombstone = await binding
      .prepare(
        `SELECT deleted_at AS deletedAt FROM health_deletion_tombstones
         WHERE device_id = ? AND sample_id = ?`,
      )
      .bind(device.id, sampleId)
      .first<{ deletedAt: number }>();
    const stored = await binding
      .prepare(
        "SELECT deleted_at AS deletedAt FROM health_samples WHERE device_id = ? AND sample_id = ?",
      )
      .bind(device.id, sampleId)
      .first<{ deletedAt: number }>();
    expect(tombstone?.deletedAt).toBe(Date.parse("2026-07-25T08:00:00.000Z"));
    expect(stored?.deletedAt).toBe(Date.parse("2026-07-25T08:00:00.000Z"));
  });
});

function request(
  overrides: Partial<SampleIngestionRequestV1> & Pick<SampleIngestionRequestV1, "requestId">,
): SampleIngestionRequestV1 {
  return {
    device: {
      deviceId: device.id,
      installationId: device.installationId,
      platform: "ios",
      appVersion: "1.0.0",
    },
    samples: [],
    deletions: [],
    ...overrides,
  };
}

function sample() {
  return {
    sampleId,
    type: "bodyMass" as const,
    value: 82_350,
    unit: "g" as const,
    startAt: "2026-07-24T08:00:00.000Z",
    endAt: "2026-07-24T08:00:00.000Z",
    source: {
      bundleIdentifier: "com.weightgurus.app",
      name: "Weight Gurus",
      metadata: { syncIdentifier: "wg-123" },
    },
  };
}

async function count(binding: D1Database, table: string) {
  const result = await binding.prepare(`SELECT count(*) AS count FROM ${table}`).first<{
    count: number;
  }>();
  return result?.count;
}
