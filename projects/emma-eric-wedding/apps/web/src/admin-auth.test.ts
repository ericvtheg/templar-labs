import assert from "node:assert/strict";
import { test } from "node:test";
import { adminAccessForUser, adminEmail, isAdminEmail } from "./lib/admin-auth.ts";

test("allows only the configured admin Gmail account", () => {
  assert.equal(isAdminEmail(adminEmail), true);
  assert.equal(isAdminEmail("ERICANDEMMA2027@GMAIL.COM"), true);
  assert.equal(isAdminEmail("ericandemma2027+other@gmail.com"), false);
  assert.equal(isAdminEmail("someone@gmail.com"), false);
});

test("classifies signed-out, authorized, and forbidden users", () => {
  assert.equal(adminAccessForUser(null), "signed-out");
  assert.equal(adminAccessForUser({ email: adminEmail }), "authorized");
  assert.equal(adminAccessForUser({ email: "someone@gmail.com" }), "forbidden");
});
