import assert from "node:assert/strict";
import test from "node:test";
import { ApiAuthConfigError, defineApiAuthManifest } from "../src/index.ts";

test("defines an app-scoped permission manifest", () => {
  const manifest = defineApiAuthManifest({
    audience: "your-shopper:web",
    keyPrefix: "ys_live_",
    permissions: {
      hello: ["read"],
    },
  });

  assert.equal(manifest.audience, "your-shopper:web");
  assert.deepEqual(manifest.permissions, { hello: ["read"] });
});

test("rejects ambiguous key prefixes", () => {
  assert.throws(
    () =>
      defineApiAuthManifest({
        audience: "your-shopper:web",
        keyPrefix: "Your Shopper",
        permissions: { hello: ["read"] },
      }),
    ApiAuthConfigError,
  );
});
