import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformAdminId, platformAdminUserIds } from "../src/lib/access.ts";

test("global admin access is determined only by canonical user ID", () => {
  const adminId = "test-admin-id";
  platformAdminUserIds.add(adminId);

  try {
    assert.equal(isPlatformAdminId(adminId), true);
    assert.equal(isPlatformAdminId("another-user-id"), false);
  } finally {
    platformAdminUserIds.delete(adminId);
  }
});
