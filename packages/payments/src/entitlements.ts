import type { PaymentEntitlementRecord } from "./schema.ts";

export type EntitlementGateReason =
  | "active-entitlement"
  | "grace-entitlement"
  | "expired-entitlement"
  | "inactive-entitlement"
  | "missing-entitlement";

export type EntitlementGateResult = {
  readonly allowed: boolean;
  readonly reason: EntitlementGateReason;
  readonly entitlement?: PaymentEntitlementRecord;
};

export function evaluateEntitlementAccess(
  entitlements: readonly PaymentEntitlementRecord[],
  now: Date,
): EntitlementGateResult {
  const active = entitlements.find((entitlement) => entitlementAllowsAccess(entitlement, now));

  if (active !== undefined) {
    return {
      allowed: true,
      reason: active.accessStatus === "grace" ? "grace-entitlement" : "active-entitlement",
      entitlement: active,
    };
  }

  if (entitlements.length === 0) {
    return {
      allowed: false,
      reason: "missing-entitlement",
    };
  }

  const hasExpired = entitlements.some(
    (entitlement) => entitlement.expiresAt !== null && entitlement.expiresAt <= now,
  );

  const entitlement = entitlements[0];

  if (entitlement === undefined) {
    return {
      allowed: false,
      reason: "missing-entitlement",
    };
  }

  return {
    allowed: false,
    reason: hasExpired ? "expired-entitlement" : "inactive-entitlement",
    entitlement,
  };
}

export function entitlementAllowsAccess(entitlement: PaymentEntitlementRecord, now: Date): boolean {
  if (!entitlement.active) {
    return false;
  }

  return entitlement.expiresAt === null || entitlement.expiresAt > now;
}
