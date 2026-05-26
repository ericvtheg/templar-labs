import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEntitlementAccess } from "./entitlements.ts";
import type { PaymentEntitlementRecord } from "./schema.ts";

test("feature gates fail closed with a reason", () => {
  const result = evaluateEntitlementAccess([], new Date("2026-01-01T00:00:00.000Z"));

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "missing-entitlement");
});

test("feature gates allow active lifetime entitlements", () => {
  const entitlement = entitlementRecord({
    accessKind: "lifetime",
    accessStatus: "active",
    active: true,
    expiresAt: null,
    sourceType: "lifetime_purchase",
  });
  const result = evaluateEntitlementAccess([entitlement], new Date("2026-01-01T00:00:00.000Z"));

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "active-entitlement");
  assert.equal(result.entitlement, entitlement);
});

test("feature gates distinguish grace access", () => {
  const entitlement = entitlementRecord({
    accessKind: "subscription",
    accessStatus: "grace",
    active: true,
    expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    sourceType: "subscription",
  });
  const result = evaluateEntitlementAccess([entitlement], new Date("2026-01-01T00:00:00.000Z"));

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "grace-entitlement");
});

function entitlementRecord(
  overrides: Pick<
    PaymentEntitlementRecord,
    "accessKind" | "accessStatus" | "active" | "expiresAt" | "sourceType"
  >,
): PaymentEntitlementRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "entitlement-id",
    projectKey: "project",
    userId: "user",
    entitlementKey: "premium",
    sourceId: "source",
    startsAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
