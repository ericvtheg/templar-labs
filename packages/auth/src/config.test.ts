import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTemplarAuthConfig, templarAuthCookiePrefix } from "./config.ts";
import { AuthConfigError } from "./errors.ts";

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
