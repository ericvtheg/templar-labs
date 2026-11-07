import assert from "node:assert/strict";
import test from "node:test";
import { authFailure } from "../src/lib/auth-errors.ts";

test("auth errors expose only fixed diagnostic names, never upstream text", () => {
  assert.equal(authFailure({}), undefined);
  assert.equal(authFailure({ auth_reason: "access" }), undefined);
  for (const reason of [
    "missing_transaction",
    "expired_transaction",
    "invalid_transaction",
    "invalid_callback",
    "provider",
    "exchange",
    "verification",
    "session",
    "access",
  ]) {
    assert.equal(authFailure({ error: "auth", auth_reason: reason })?.reason, reason);
    assert.ok(authFailure({ error: "auth", auth_reason: reason })?.message);
  }
  for (const reason of [undefined, null, {}, "__proto__", "constructor", "upstream-secret"]) {
    assert.equal(authFailure({ error: "auth", auth_reason: reason })?.reason, "unknown");
  }
});
