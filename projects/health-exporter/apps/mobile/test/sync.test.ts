// biome-ignore-all lint/suspicious/useAwait: async interface fixtures intentionally resolve synchronously.
import assert from "node:assert/strict";
import { test } from "node:test";
import { batches, exportHealth, type HealthReader, validateDestination } from "../src/sync.ts";

const destination = {
  url: "https://test.invalid",
  secret: "synthetic-fixture-key-123456789012345",
  deviceId: "00000000-0000-4000-8000-000000000000",
};
const record = (i: number) => ({ id: String(i), parentId: String(i), data: { value: i } });

test("full history spans many pages; checkpoints follow successful uploads and restart resumes", async () => {
  const posts: Record<string, unknown>[] = [];
  const anchors: (string | null)[] = [];
  const reader: HealthReader = {
    requestPermissions: () => Promise.resolve(),
    getTypes: async () => [{ id: "steps", name: "Steps" }],
    readPage: async (_type, anchor) => {
      anchors.push(anchor);
      const page = anchor === null ? 0 : Number(anchor);
      return {
        records: Array.from({ length: 125 }, (_, i) => record(page * 125 + i)),
        deleted: [],
        anchor: String(page + 1),
        hasMore: page < 3,
      };
    },
  };
  let saved: string | undefined;
  const fetcher: typeof fetch = async (_, init) => {
    if (init?.method === "GET") {
      return Response.json({
        protocol: 2,
        totalRecords: 0,
        checkpoints: saved ? { steps: saved } : {},
        types: [],
      });
    }
    const body = JSON.parse(String(init?.body));
    posts.push(body);
    if (body.checkpoint !== undefined) {
      saved = body.checkpoint;
    }
    return Response.json({ accepted: body.records.length });
  };
  const options = { destination, reader, fetcher, progress: () => undefined, paused: () => false };
  const result = await exportHealth(options);
  assert.equal(result.sent, 500);
  assert.deepEqual(anchors, [null, "1", "2", "3"]);
  assert.equal(posts.length, 12);
  assert.deepEqual(
    posts.slice(0, 3).map((p) => p.checkpoint),
    [undefined, undefined, "1"],
  );
  anchors.length = 0;
  await exportHealth(options);
  assert.equal(anchors[0], "4");
  anchors.length = 0;
  await exportHealth({ ...options, fromBeginning: true });
  assert.equal(anchors[0], null);
});

test("failed batch never advances its checkpoint; a native type error is reported while other types continue", async () => {
  const posts: Record<string, unknown>[] = [];
  const reader: HealthReader = {
    requestPermissions: () => Promise.resolve(),
    getTypes: async () => [
      { id: "unavailable", name: "Unavailable" },
      { id: "sleep", name: "Sleep" },
    ],
    readPage: async (type) => {
      if (type === "unavailable") {
        throw new Error("Permission unavailable");
      }
      return {
        records: Array.from({ length: 150 }, (_, i) => record(i)),
        deleted: [],
        anchor: "next",
        hasMore: false,
      };
    },
  };
  const fetcher: typeof fetch = async (_, init) => {
    if (init?.method === "GET") {
      return Response.json({ protocol: 2, totalRecords: 0, checkpoints: {}, types: [] });
    }
    const body = JSON.parse(String(init?.body));
    posts.push(body);
    return Response.json({}, { status: posts.length === 2 ? 503 : 200 });
  };
  await assert.rejects(
    exportHealth({ destination, reader, fetcher, progress: () => undefined, paused: () => false }),
    /503/,
  );
  assert.ok(posts.every((p) => p.checkpoint === undefined));
  const succeeds: typeof fetch = async (url, init) => {
    if (init?.method === "GET") {
      return fetcher(url, init);
    }
    return Response.json({ accepted: 0 });
  };
  const result = await exportHealth({
    destination,
    reader,
    fetcher: succeeds,
    progress: () => undefined,
    paused: () => false,
  });
  assert.equal(result.completed, 1);
  assert.match(result.errors[0] ?? "", /Permission unavailable/);
});

test("large Unicode records are split by encoded size, and unsafe destinations are rejected", () => {
  const records = Array.from({ length: 15 }, (_, i) => ({
    ...record(i),
    data: "漢".repeat(100_000),
  }));
  const chunks = batches(records);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.flat().length, records.length);
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(JSON.stringify(chunk)) < 2 * 1024 * 1024);
  }
  assert.throws(() => validateDestination("http://test.invalid", destination.secret), /HTTPS/);
  assert.throws(
    () => validateDestination("https://user:password@test.invalid", destination.secret),
    /credentials/,
  );
  assert.equal(
    validateDestination("https://test.invalid/", destination.secret),
    "https://test.invalid",
  );
});
