import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit } from "effect";
import { type AuthSession, makeAuthService } from "./service.ts";

test("requireUser fails when no session exists", async () => {
  const service = makeAuthService({
    api: {
      getSession: async () => null,
    },
  });

  const result = await Effect.runPromiseExit(
    service.requireUser(new Request("https://example.com")),
  );

  assert.ok(Exit.isFailure(result));
  if (Exit.isFailure(result)) {
    assert.ok(result.cause.toString().includes("AuthUnauthorizedError"));
  }
});

test("requireUser returns the session user", async () => {
  const session = testSession();
  const service = makeAuthService({
    api: {
      getSession: async () => session,
    },
  });

  const result = await Effect.runPromise(service.requireUser(new Request("https://example.com")));

  assert.equal(result.id, session.user.id);
});

test("requireTenant returns the default user tenant", async () => {
  const session = testSession();
  const service = makeAuthService({
    api: {
      getSession: async () => session,
    },
  });

  const result = await Effect.runPromise(service.requireTenant(new Request("https://example.com")));

  assert.equal(result.id, session.user.id);
});

test("requireTenant uses a package-level tenant resolver", async () => {
  const service = makeAuthService({
    api: {
      getSession: async () => testSession(),
    },
    tenant: () => Effect.succeed({ id: "tenant-id" }),
  });

  const result = await Effect.runPromise(service.requireTenant(new Request("https://example.com")));

  assert.equal(result.id, "tenant-id");
});

test("requireTenant fails when no session exists", async () => {
  const service = makeAuthService({
    api: {
      getSession: async () => null,
    },
  });

  const result = await Effect.runPromiseExit(
    service.requireTenant(new Request("https://example.com")),
  );

  assert.ok(Exit.isFailure(result));
  if (Exit.isFailure(result)) {
    assert.ok(result.cause.toString().includes("AuthTenantRequiredError"));
  }
});

function testSession(): AuthSession {
  const user = {
    id: "user-id",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  return {
    session: {
      id: "session-id",
      userId: user.id,
      token: "token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ipAddress: null,
      userAgent: null,
    },
    user,
  } satisfies AuthSession;
}
