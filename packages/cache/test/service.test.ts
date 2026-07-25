import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either, Option } from "effect";
import type { CacheDriver } from "../src/driver.ts";
import { CacheSerializationError, CacheTtlError } from "../src/errors.ts";
import { makeCacheService } from "../src/service.ts";
import type { CacheDriverSetInput, CacheStoredEntry } from "../src/types.ts";

test("get returns none for a cache miss", async () => {
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(),
  });

  const result = await Effect.runPromise(cache.get("missing"));

  assert.equal(Option.isNone(result), true);
});

test("set stores JSON and get deserializes it", async () => {
  const values = new Map<string, CacheStoredEntry>();
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(values),
  });

  await Effect.runPromise(
    cache.set({
      key: "profile:1",
      value: { name: "Ada" },
      ttlSeconds: 60,
      metadata: { source: "test" },
    }),
  );

  const result = await Effect.runPromise(cache.get<{ name: string }>("profile:1"));
  const entry = Option.getOrThrow(result);

  assert.deepEqual(entry, {
    key: "profile:1",
    value: { name: "Ada" },
    metadata: { source: "test" },
  });
});

test("getOrSet computes on miss and reuses hits", async () => {
  let calls = 0;
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(),
  });

  const input = {
    key: "expensive:1",
    ttlSeconds: 60,
    compute: Effect.sync(() => {
      calls += 1;
      return { count: calls };
    }),
  };

  const first = await Effect.runPromise(cache.getOrSet(input));
  const second = await Effect.runPromise(cache.getOrSet(input));

  assert.deepEqual(first, { count: 1 });
  assert.deepEqual(second, { count: 1 });
  assert.equal(calls, 1);
});

test("delete removes a key", async () => {
  const values = new Map<string, CacheStoredEntry>();
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(values),
  });

  await Effect.runPromise(cache.set({ key: "cached", value: true, ttlSeconds: 60 }));
  await Effect.runPromise(cache.delete("cached"));

  const result = await Effect.runPromise(cache.get("cached"));

  assert.equal(Option.isNone(result), true);
});

test("set rejects TTLs below the minimum", async () => {
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(),
  });

  const result = await Effect.runPromise(
    Effect.either(cache.set({ key: "short", value: true, ttlSeconds: 30 })),
  );

  assert.ok(Either.isLeft(result));
  assert.equal(result.left instanceof CacheTtlError, true);
});

test("set rejects non-JSON values", async () => {
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(),
  });

  const circular: { self?: unknown } = {};
  circular.self = circular;

  const result = await Effect.runPromise(
    Effect.either(cache.set({ key: "circular", value: circular, ttlSeconds: 60 })),
  );

  assert.ok(Either.isLeft(result));
  assert.equal(result.left instanceof CacheSerializationError, true);
});

test("get rejects malformed stored JSON", async () => {
  const values = new Map<string, CacheStoredEntry>([
    ["broken", { key: "broken", value: "{", metadata: undefined }],
  ]);
  const cache = makeCacheService({
    provider: "test",
    driver: makeDriver(values),
  });

  const result = await Effect.runPromise(Effect.either(cache.get("broken")));

  assert.ok(Either.isLeft(result));
  assert.equal(result.left instanceof CacheSerializationError, true);
});

function makeDriver(values = new Map<string, CacheStoredEntry>()): CacheDriver {
  return {
    get: (key) => Effect.succeed(Option.fromNullable(values.get(key))),
    set: (input: CacheDriverSetInput) =>
      Effect.sync(() => {
        values.set(input.key, {
          key: input.key,
          value: input.value,
          metadata: input.metadata,
        });
      }),
    delete: (key) =>
      Effect.sync(() => {
        values.delete(key);
      }),
  };
}
