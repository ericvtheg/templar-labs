import assert from "node:assert/strict";
import { test } from "node:test";
import { editorAccessForUser, parseEditorEmailAllowlist } from "../src/lib/editor-access.ts";

const normalUser = {
  id: "user-1",
  email: "editor@example.test",
  emailVerified: true,
  admin: false,
};

test("requires authentication for wedding editor access", () => {
  assert.equal(editorAccessForUser(null, ["editor@example.test"]), "signed-out");
});

test("allows a verified user on the wedding-specific email allowlist", () => {
  assert.equal(editorAccessForUser(normalUser, [" EDITOR@example.test "]), "authorized");
});

test("forbids unrelated and unverified users", () => {
  assert.equal(editorAccessForUser(normalUser, ["someone-else@example.com"]), "forbidden");
  assert.equal(
    editorAccessForUser({ ...normalUser, emailVerified: false }, ["editor@example.test"]),
    "forbidden",
  );
});

test("retains global admin access for bootstrap and support", () => {
  assert.equal(editorAccessForUser({ ...normalUser, admin: true }, []), "authorized");
});

test("normalizes a comma-separated allowlist without inventing identities", () => {
  assert.deepEqual(parseEditorEmailAllowlist(" Editor@Example.test, owner@example.test, "), [
    "editor@example.test",
    "owner@example.test",
  ]);
  assert.deepEqual(parseEditorEmailAllowlist(undefined), []);
});
