import assert from "node:assert/strict";
import { test } from "node:test";
import { type AuthSession, makeAuthService } from "@templar/auth";
import { Effect, Exit } from "effect";
import type { AppUser } from "../src/schema.ts";
import { makeUsersService, type UsersStore } from "../src/service.ts";

test("ensureUser creates one local row and updates last_seen_at idempotently", async () => {
  const rows = new Map<string, AppUser>();
  const store = memoryStore(rows);
  const times = [new Date(1_000), new Date(2_000)];
  const users = makeUsersService({
    auth: authenticatedService("canonical-user-id"),
    store,
    now: () => times.shift() ?? new Date(2_000),
  });
  const request = new Request("https://app.ericventor.com/admin");

  const created = await Effect.runPromise(users.ensureUser(request));
  const seenAgain = await Effect.runPromise(users.ensureUser(request));

  assert.equal(rows.size, 1);
  assert.equal(created.id, "canonical-user-id");
  assert.equal(created.createdAt.getTime(), 1_000);
  assert.equal(seenAgain.createdAt.getTime(), 1_000);
  assert.equal(seenAgain.lastSeenAt.getTime(), 2_000);
});

test("separate apps do not get a local row before authenticating the user", async () => {
  const appARows = new Map<string, AppUser>();
  const appBRows = new Map<string, AppUser>();
  const auth = authenticatedService("canonical-user-id");
  const request = new Request("https://app.ericventor.com");

  await Effect.runPromise(
    makeUsersService({ auth, store: memoryStore(appARows) }).ensureUser(request),
  );

  assert.equal(appARows.has("canonical-user-id"), true);
  assert.equal(appBRows.has("canonical-user-id"), false);
});

test("ensureUser requires a verified app session", async () => {
  const users = makeUsersService({
    auth: makeAuthService({ api: { getSession: async () => null } }),
    store: memoryStore(new Map()),
  });

  const result = await Effect.runPromiseExit(
    users.ensureUser(new Request("https://app.ericventor.com")),
  );

  assert.ok(Exit.isFailure(result));
  if (Exit.isFailure(result)) {
    assert.ok(result.cause.toString().includes("AuthUnauthorizedError"));
  }
});

function memoryStore(rows: Map<string, AppUser>): UsersStore {
  return {
    ensure: (userId, seenAt) => {
      const existing = rows.get(userId);
      const row = {
        id: userId,
        createdAt: existing?.createdAt ?? seenAt,
        lastSeenAt: seenAt,
      };
      rows.set(userId, row);
      return Promise.resolve(row);
    },
  };
}

function authenticatedService(userId: string) {
  return makeAuthService({
    api: {
      getSession: async () => testSession(userId),
    },
  });
}

function testSession(userId: string): AuthSession {
  const now = new Date(0);
  return {
    session: {
      id: "session-id",
      userId,
      token: "token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
