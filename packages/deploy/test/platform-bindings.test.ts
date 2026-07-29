import assert from "node:assert/strict";
import test from "node:test";
import { createTemplarPlatformBindings } from "../src/cloudflare/platform-bindings.ts";

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
