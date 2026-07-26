import assert from "node:assert/strict";
import { test } from "node:test";
import type { BetterAuthOptions } from "better-auth";
import {
  createBetterAuthOptions,
  normalizeTemplarAuthConfig,
  templarAuthCookiePrefix,
  templarAuthSessionExpiresInSeconds,
  templarAuthSessionFreshAgeSeconds,
  templarAuthSessionUpdateAgeSeconds,
} from "../src/config.ts";
import { AuthConfigError } from "../src/errors.ts";

const db = {} as D1Database;

test("normalizes project auth defaults", () => {
  const config = normalizeTemplarAuthConfig({
    project: "Hello World",
    app: "Web",
    baseURL: "https://example.com/",
    secret: "secret",
    db,
  });

  assert.equal(config.project, "Hello World");
  assert.equal(config.app, "Web");
  assert.equal(config.appName, "Breli App");
  assert.equal(config.baseURL, "https://example.com");
  assert.equal(config.cookiePrefix, "templar.hello-world.web.auth");
  assert.deepEqual(config.oauth, {});
  assert.deepEqual(config.trustedOrigins, []);
  assert.equal(typeof config.schema.user, "object");
});

test("rejects missing required config values", () => {
  assert.throws(
    () =>
      normalizeTemplarAuthConfig({
        project: "",
        app: "web",
        baseURL: "https://example.com",
        secret: "secret",
        db,
      }),
    AuthConfigError,
  );
});

test("rejects invalid base URLs", () => {
  assert.throws(
    () =>
      normalizeTemplarAuthConfig({
        project: "hello-world",
        app: "web",
        baseURL: "not a url",
        secret: "secret",
        db,
      }),
    AuthConfigError,
  );
});

test("builds stable cookie prefixes", () => {
  assert.equal(
    templarAuthCookiePrefix("UI Showcase", "Admin Web"),
    "templar.ui-showcase.admin-web.auth",
  );
});

test("uses Templar session lifetime defaults", () => {
  const config = normalizeTemplarAuthConfig({
    project: "Hello World",
    app: "Web",
    baseURL: "https://example.com/",
    secret: "secret",
    db,
  });
  const options = createBetterAuthOptions(config, {} as BetterAuthOptions["database"], []);

  assert.equal(options.session?.expiresIn, templarAuthSessionExpiresInSeconds);
  assert.equal(options.session?.updateAge, templarAuthSessionUpdateAgeSeconds);
  assert.equal(options.session?.freshAge, templarAuthSessionFreshAgeSeconds);
});

test("passes app-specific database hooks to Better Auth", () => {
  const databaseHooks = {
    user: {
      create: {
        before: async () => false,
      },
    },
  } satisfies NonNullable<BetterAuthOptions["databaseHooks"]>;
  const config = normalizeTemplarAuthConfig({
    project: "Hello World",
    app: "Web",
    baseURL: "https://example.com/",
    secret: "secret",
    db,
    databaseHooks,
  });
  const options = createBetterAuthOptions(config, {} as BetterAuthOptions["database"], []);

  assert.equal(options.databaseHooks, databaseHooks);
});

test("keeps framework cookie plugins last", () => {
  const frameworkPlugin = { id: "framework" };
  const appPlugin = { id: "app" };
  const config = normalizeTemplarAuthConfig({
    project: "Hello World",
    app: "Web",
    baseURL: "https://example.com/",
    secret: "secret",
    db,
    plugins: [appPlugin],
  });
  const options = createBetterAuthOptions(config, {} as BetterAuthOptions["database"], [
    frameworkPlugin,
  ]);

  assert.deepEqual(
    options.plugins?.map((plugin) => plugin.id),
    ["app", "framework"],
  );
});
