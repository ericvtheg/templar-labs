import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HealthSyncRequestV1, StepSampleV1 } from "../src/contracts/v1.ts";
import { RequestIdConflict } from "../src/domain/repository.ts";
import { makeD1HealthRepository } from "../src/infrastructure/d1-repository.ts";

const sample: StepSampleV1 = {
  sampleId: "df9dd8e9-470a-477c-b22a-f13fd853ce89",
  type: "stepCount",
  value: 412,
  unit: "count",
  startAt: "2026-09-18T08:00:00.000Z",
  endAt: "2026-09-18T09:00:00.000Z",
  source: { bundleIdentifier: "com.apple.health", name: "Health" },
};

const input: HealthSyncRequestV1 = {
  requestId: "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
  deviceId: "42eaa184-e6cd-42af-aae8-160ecd461157",
  samples: [sample],
};

describe("D1 health repository", () => {
  let miniflare: Miniflare;
  let db: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-05-15",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    });
    db = (await miniflare.getD1Database("DB")) as D1Database;
    const migration = await readFile(
      new URL("../../../db/migrations/0000_health_exporter.sql", import.meta.url),
      "utf8",
    );
    await db.batch(
      migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.prepare(statement)),
    );
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("persists once, replays stable counters, exposes status, and rejects altered replays", async () => {
    const repository = makeD1HealthRepository(db);
    await expect(repository.ingest(input)).resolves.toMatchObject({
      status: "accepted",
      inserted: 1,
    });
    await expect(repository.ingest(input)).resolves.toMatchObject({
      status: "replayed",
      inserted: 1,
    });
    await expect(repository.status()).resolves.toMatchObject({
      deviceId: input.deviceId,
      totalSamples: 1,
      lastSync: { requestId: input.requestId, acceptedSamples: 1 },
    });
    await expect(
      repository.ingest({
        ...input,
        samples: [{ ...sample, value: 999 }],
      }),
    ).rejects.toBeInstanceOf(RequestIdConflict);
    const count = await db
      .prepare("SELECT count(*) AS count FROM health_step_samples")
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});
