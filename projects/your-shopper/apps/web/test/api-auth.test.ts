import assert from "node:assert/strict";
import test from "node:test";
import { apiAuthManifest } from "../src/lib/api-auth-manifest.ts";

test("uses an isolated API audience with shopping-run permission", () => {
  assert.equal(apiAuthManifest.audience, "your-shopper:web");
  assert.equal(apiAuthManifest.keyPrefix, "ys_live_");
  assert.deepEqual(apiAuthManifest.permissions, { runs: ["create"] });
});
