import assert from "node:assert/strict";
import { test } from "node:test";
import { adminAccessForUser } from "../src/lib/admin-auth.ts";

test("classifies users from the signed global admin claim", () => {
  assert.equal(adminAccessForUser(null), "signed-out");
  assert.equal(adminAccessForUser({ admin: true }), "authorized");
  assert.equal(adminAccessForUser({ admin: false }), "forbidden");
});
