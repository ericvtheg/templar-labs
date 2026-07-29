import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoTemplarBindingCollisions,
  createTemplarPlatformBindings,
} from "../src/cloudflare/platform-bindings.ts";

test("creates local platform bindings from the app identity", () => {
  assert.deepEqual(
    createTemplarPlatformBindings({
      appId: "your-shopper",
      local: true,
    }),
    {
      TEMPLAR_APP_ID: "your-shopper",
      TEMPLAR_AUTH_ISSUER: "https://auth.breli.app",
      TEMPLAR_ENVIRONMENT: "local",
    },
  );
});

test("creates production platform bindings from the app identity", () => {
  assert.deepEqual(
    createTemplarPlatformBindings({
      appId: "hello-world",
      local: false,
    }),
    {
      TEMPLAR_APP_ID: "hello-world",
      TEMPLAR_AUTH_ISSUER: "https://auth.breli.app",
      TEMPLAR_ENVIRONMENT: "prod",
    },
  );
});

test("rejects custom bindings that collide with platform metadata", () => {
  assert.throws(
    () =>
      assertNoTemplarBindingCollisions({
        TEMPLAR_APP_ID: "overridden",
      }),
    /binding "TEMPLAR_APP_ID" is managed automatically/,
  );
});

test("rejects custom bindings that collide with enabled services and resources", () => {
  assert.throws(
    () =>
      assertNoTemplarBindingCollisions(
        {
          DB: "overridden",
        },
        ["AUTH_SECRET", "DB"],
      ),
    /binding "DB" is managed automatically/,
  );
});

test("allows unrelated custom bindings", () => {
  assert.doesNotThrow(() =>
    assertNoTemplarBindingCollisions(
      {
        EMAIL: "binding",
      },
      ["AUTH_SECRET", "DB"],
    ),
  );
});
