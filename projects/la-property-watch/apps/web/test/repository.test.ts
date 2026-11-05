import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ResearchRecord } from "../src/lib/model.ts";
import { parseCnpaRss } from "../src/lib/parsers.ts";
import { loadDashboard, requestRefreshJob, runRefreshJob } from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const observedAt = "2026-11-05T12:00:00.000Z";

async function fixtureRecord(): Promise<ResearchRecord> {
  const xml = await readFile(
    new URL("./fixtures/cnpa-la-trustee-rss.xml", import.meta.url),
    "utf8",
  );
  const record = parseCnpaRss(xml, observedAt).records[0];
  if (!record) {
    throw new Error("Captured CNPA fixture did not produce a record.");
  }
  return record;
}

describe("refresh persistence", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
  });
  afterEach(() => database.close());

  it("deduplicates repeated live observations and preserves first-seen provenance", async () => {
    const first = await fixtureRecord();
    const job = await requestRefreshJob(database.binding, "bootstrap", new Date(observedAt));
    await runRefreshJob(database.binding, job.job.id, "bootstrap", [
      {
        id: "fixture",
        name: "Captured source",
        url: first.sourceUrl,
        load: async () => ({
          sourceId: "fixture",
          sourceName: "Captured source",
          sourceUrl: first.sourceUrl,
          records: [first],
          warnings: [],
        }),
      },
    ]);
    const later = {
      ...first,
      observedAt: "2026-11-06T12:00:00.000Z",
      lastSeenAt: "2026-11-06T12:00:00.000Z",
      updatedAt: "2026-11-06T12:00:00.000Z",
      unpaidBalanceCents: 123,
    };
    const secondJob = await requestRefreshJob(
      database.binding,
      "manual",
      new Date("2026-11-06T12:00:00.000Z"),
    );
    await runRefreshJob(database.binding, secondJob.job.id, "manual", [
      {
        id: "fixture",
        name: "Captured source",
        url: first.sourceUrl,
        load: async () => ({
          sourceId: "fixture",
          sourceName: "Captured source",
          sourceUrl: first.sourceUrl,
          records: [later],
          warnings: [],
        }),
      },
    ]);
    const dashboard = await loadDashboard(database.binding);
    assert.equal(dashboard.records.length, 1);
    assert.equal(dashboard.records[0]?.firstSeenAt, observedAt);
    assert.equal(dashboard.records[0]?.lastSeenAt, later.lastSeenAt);
    assert.equal(dashboard.records[0]?.unpaidBalanceCents, 123);
    assert.equal(dashboard.refreshJobs[0]?.status, "success");
  });

  it("reuses an active queued job instead of farming concurrent refreshes", async () => {
    const first = await requestRefreshJob(database.binding, "manual", new Date(observedAt));
    const second = await requestRefreshJob(
      database.binding,
      "manual",
      new Date("2026-11-05T12:01:00.000Z"),
    );
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.job.id, first.job.id);
  });

  it("atomically admits one refresh under concurrent requests", async () => {
    const requests = await Promise.all(
      Array.from({ length: 12 }, () =>
        requestRefreshJob(database.binding, "manual", new Date(observedAt)),
      ),
    );
    assert.equal(requests.filter((request) => request.created).length, 1);
    assert.equal(new Set(requests.map((request) => request.job.id)).size, 1);
    const count = database.sqlite.prepare("SELECT count(*) AS count FROM refresh_jobs").get()?.[
      "count"
    ];
    assert.equal(count, 1);
  });

  it("reuses a completed job for 20 seconds before allowing another source crawl", async () => {
    const first = await requestRefreshJob(database.binding, "manual", new Date(observedAt));
    const record = await fixtureRecord();
    await runRefreshJob(database.binding, first.job.id, "manual", [
      {
        id: "fixture",
        name: "Captured source",
        url: record.sourceUrl,
        load: async () => ({
          sourceId: "fixture",
          sourceName: "Captured source",
          sourceUrl: record.sourceUrl,
          records: [record],
          warnings: [],
        }),
      },
    ]);
    const finishedAt = database.sqlite
      .prepare("SELECT finished_at FROM refresh_jobs WHERE id = ?")
      .get(first.job.id)?.["finished_at"];
    assert.equal(typeof finishedAt, "string");
    const within = await requestRefreshJob(
      database.binding,
      "manual",
      new Date(new Date(String(finishedAt)).getTime() + 19_000),
    );
    assert.equal(within.created, false);
    assert.equal(within.job.id, first.job.id);
    const after = await requestRefreshJob(
      database.binding,
      "manual",
      new Date(new Date(String(finishedAt)).getTime() + 21_000),
    );
    assert.equal(after.created, true);
    assert.notEqual(after.job.id, first.job.id);
  });

  it("recomputes stale persisted statuses when dashboard data is read", async () => {
    const record = {
      ...(await fixtureRecord()),
      scheduledDate: "2020-01-01",
      status: "scheduled_as_published" as const,
    };
    const job = await requestRefreshJob(database.binding, "bootstrap", new Date(observedAt));
    await runRefreshJob(database.binding, job.job.id, "bootstrap", [
      {
        id: "fixture",
        name: "Captured source",
        url: record.sourceUrl,
        load: async () => ({
          sourceId: "fixture",
          sourceName: "Captured source",
          sourceUrl: record.sourceUrl,
          records: [record],
          warnings: [],
        }),
      },
    ]);
    database.sqlite
      .prepare("UPDATE foreclosure_records SET status = 'scheduled_as_published'")
      .run();
    assert.equal(
      (await loadDashboard(database.binding)).records[0]?.status,
      "past_outcome_unverified",
    );
  });

  it("records blocked sources as failed and usable warnings as partial", async () => {
    const failedJob = await requestRefreshJob(database.binding, "manual", new Date(observedAt));
    const failed = await runRefreshJob(database.binding, failedJob.job.id, "manual", [
      {
        id: "blocked",
        name: "Blocked source",
        url: "https://source.example/",
        load: async () => {
          throw new Error("HTTP 403 from publisher");
        },
      },
    ]);
    assert.equal(failed.ok, false);
    assert.equal((await loadDashboard(database.binding)).refreshJobs[0]?.status, "failed");

    const record = await fixtureRecord();
    const partialJob = await requestRefreshJob(
      database.binding,
      "manual",
      new Date("2026-11-06T12:00:00.000Z"),
    );
    await runRefreshJob(database.binding, partialJob.job.id, "manual", [
      {
        id: "partial",
        name: "Partial source",
        url: record.sourceUrl,
        load: async () => ({
          sourceId: "partial",
          sourceName: "Partial source",
          sourceUrl: record.sourceUrl,
          records: [record],
          warnings: ["One field was unavailable."],
        }),
      },
    ]);
    const dashboard = await loadDashboard(database.binding);
    assert.equal(dashboard.refreshJobs[0]?.status, "partial");
    assert.equal(dashboard.sources[0]?.status, "partial");
    assert.match(dashboard.sources[0]?.error ?? "", /unavailable/);
  });
});
