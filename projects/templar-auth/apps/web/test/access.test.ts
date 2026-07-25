import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformAdminEmail } from "../src/lib/access.ts";

test("global admin access is determined by normalized email", () => {
  assert.equal(isPlatformAdminEmail("ericandemma2027@gmail.com"), true);
  assert.equal(isPlatformAdminEmail(" ERICANDEMMA2027@GMAIL.COM "), true);
  assert.equal(isPlatformAdminEmail("ericandemma2027+other@gmail.com"), false);
  assert.equal(isPlatformAdminEmail("someone@gmail.com"), false);
});
