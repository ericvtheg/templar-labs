import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  ApiAuthInputError,
  type ApiAuthStore,
  type ApiKeyOwner,
  defineApiAuthManifest,
  makeApiAuthService,
  type StoredApiKey,
} from "../src/index.ts";

const manifest = defineApiAuthManifest({
  audience: "your-shopper:web",
  keyPrefix: "ys_live_",
  permissions: {
    hello: ["read", "write"],
  },
  keys: {
    maximumActivePerUser: 2,
  },
});

test("creates, redacts, verifies, and revokes an app-local key", async () => {
  const store = makeMemoryStore();
  const service = makeApiAuthService({
    store,
    manifest,
    secrets: [{ version: 1, value: "a-secure-test-secret-that-is-long-enough" }],
    clock: {
      now: () => new Date("2026-07-29T10:00:00.000Z"),
      randomId: () => "key-1",
      randomSecret: () => "presented-secret",
    },
  });
  const owner = { userId: "user-1" };

  const created = await Effect.runPromise(
    service.createKey({
      ...owner,
      name: "My agent",
      permissions: { hello: ["read"] },
    }),
  );

  assert.equal(created.key, "ys_live_key-1.presented-secret");
  assert.equal(created.apiKey.start, "ys_live_key-1");
  assert.equal("secretDigest" in created.apiKey, false);

  const listed = await Effect.runPromise(service.listKeys(owner));
  assert.equal(listed.length, 1);
  const listedKey = listed[0];
  assert.ok(listedKey);
  assert.equal("key" in listedKey, false);
  assert.equal("secretDigest" in listedKey, false);

  const verified = await Effect.runPromise(
    service.verifyKey({ key: created.key, permissions: { hello: ["read"] } }),
  );
  assert.equal(verified.authenticated, true);
  if (verified.authenticated) {
    assert.equal(verified.principal.userId, owner.userId);
    assert.equal(verified.principal.audience, manifest.audience);
  }

  const forbidden = await Effect.runPromise(
    service.verifyKey({ key: created.key, permissions: { hello: ["write"] } }),
  );
  assert.deepEqual(forbidden, {
    authenticated: false,
    reason: "insufficient-permissions",
  });

  await Effect.runPromise(service.revokeKey({ ...owner, id: created.apiKey.id }));
  const revoked = await Effect.runPromise(
    service.verifyKey({ key: created.key, permissions: { hello: ["read"] } }),
  );
  assert.deepEqual(revoked, { authenticated: false, reason: "invalid-key" });
});

test("does not accept another app's key", async () => {
  const store = makeMemoryStore();
  const secret = "a-secure-test-secret-that-is-long-enough";
  const service = makeApiAuthService({
    store,
    manifest,
    secrets: [{ version: 1, value: secret }],
    clock: {
      randomId: () => "key-2",
      randomSecret: () => "presented-secret",
    },
  });
  const otherService = makeApiAuthService({
    store,
    manifest: defineApiAuthManifest({
      audience: "another-app:web",
      keyPrefix: "other_live_",
      permissions: { hello: ["read"] },
    }),
    secrets: [{ version: 1, value: secret }],
  });

  const created = await Effect.runPromise(
    service.createKey({
      userId: "user-1",
      name: "My agent",
      permissions: { hello: ["read"] },
    }),
  );
  const result = await Effect.runPromise(
    otherService.verifyKey({ key: created.key, permissions: { hello: ["read"] } }),
  );

  assert.deepEqual(result, { authenticated: false, reason: "invalid-key" });
});

test("reports invalid key creation input through Effect's error channel", async () => {
  const service = makeApiAuthService({
    store: makeMemoryStore(),
    manifest,
    secrets: [{ version: 1, value: "a-secure-test-secret-that-is-long-enough" }],
  });

  const error = await Effect.runPromise(
    Effect.flip(
      service.createKey({
        userId: "user-1",
        name: "   ",
        permissions: { hello: ["read"] },
      }),
    ),
  );

  assert.ok(error instanceof ApiAuthInputError);
  assert.equal(error.field, "name");
});

function makeMemoryStore(): ApiAuthStore {
  const records = new Map<string, StoredApiKey>();

  return {
    insert: (record) => {
      records.set(record.id, record);
      return Promise.resolve(record);
    },
    findById: (audience, id) => {
      const record = records.get(id);
      return Promise.resolve(record?.audience === audience ? record : null);
    },
    listByOwner: (audience, owner) =>
      Promise.resolve(
        [...records.values()].filter(
          (record) => record.audience === audience && sameOwner(record, owner),
        ),
      ),
    revoke: (audience, owner, id, revokedAt) => {
      const record = records.get(id);
      if (record === undefined || record.audience !== audience || !sameOwner(record, owner)) {
        return Promise.resolve(false);
      }
      records.set(id, { ...record, revokedAt, updatedAt: revokedAt });
      return Promise.resolve(true);
    },
    touchLastUsed: (audience, id, usedAt) => {
      const record = records.get(id);
      if (record?.audience === audience) {
        records.set(id, { ...record, lastUsedAt: usedAt, updatedAt: usedAt });
      }
      return Promise.resolve();
    },
  };
}

function sameOwner(record: StoredApiKey, owner: ApiKeyOwner): boolean {
  return record.userId === owner.userId;
}
