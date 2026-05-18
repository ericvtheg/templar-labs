import assert from "node:assert/strict";
import { test } from "node:test";
import { hashTemplarPassword, verifyTemplarPassword } from "./password.ts";

test("hashes and verifies templar auth passwords", async () => {
  const hash = await hashTemplarPassword("correct horse battery staple");

  assert.match(hash, /^templar-pbkdf2-sha256:v1:100000:/);
  assert.equal(
    await verifyTemplarPassword({
      hash,
      password: "correct horse battery staple",
    }),
    true,
  );
});

test("rejects incorrect templar auth passwords", async () => {
  const hash = await hashTemplarPassword("correct horse battery staple");

  assert.equal(
    await verifyTemplarPassword({
      hash,
      password: "wrong password",
    }),
    false,
  );
});

test("rejects unsupported password hash formats", async () => {
  assert.equal(
    await verifyTemplarPassword({
      hash: "not-a-templar-password-hash",
      password: "password",
    }),
    false,
  );
});
