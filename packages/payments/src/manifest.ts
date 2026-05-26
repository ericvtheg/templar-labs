import { PaymentsConfigError } from "./errors.ts";

export type PaymentsInterval = "month" | "year";
export type PaymentsOfferingType = "subscription" | "lifetime";

export type PaymentsPrice = {
  readonly currency: string;
  readonly unitAmountCents: number;
};

export type PaymentsSubscriptionPlanManifest = {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly price: PaymentsPrice;
  readonly interval?: PaymentsInterval;
  readonly trial?: {
    readonly days: number;
  };
};

export type PaymentsLifetimePurchaseManifest = {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly price: PaymentsPrice;
};

export type PaymentsManifest = {
  readonly projectKey: string;
  readonly entitlementKey: string;
  readonly allowPromotionCodes?: boolean;
  readonly subscriptionPlan: PaymentsSubscriptionPlanManifest;
  readonly lifetimePurchase: PaymentsLifetimePurchaseManifest;
};

export type NormalizedPaymentsSubscriptionPlanManifest = Omit<
  PaymentsSubscriptionPlanManifest,
  "interval" | "trial"
> & {
  readonly interval: PaymentsInterval;
  readonly trial?: {
    readonly days: number;
  };
};

export type NormalizedPaymentsManifest = Omit<
  PaymentsManifest,
  "allowPromotionCodes" | "subscriptionPlan"
> & {
  readonly allowPromotionCodes: boolean;
  readonly subscriptionPlan: NormalizedPaymentsSubscriptionPlanManifest;
};

export const paymentsMetadataKeys = {
  checkoutType: "templar_checkout_type",
  entitlementKey: "templar_entitlement_key",
  offeringKey: "templar_offering_key",
  offeringType: "templar_offering_type",
  priceFingerprint: "templar_price_fingerprint",
  projectKey: "templar_project_key",
  userId: "templar_user_id",
} as const;

export const defaultPaymentsGracePeriodDays = 7;

export function normalizePaymentsManifest(manifest: PaymentsManifest): NormalizedPaymentsManifest {
  const projectKey = requireKey("projectKey", manifest.projectKey);
  const entitlementKey = requireKey("entitlementKey", manifest.entitlementKey);
  const subscriptionPlan = normalizeSubscriptionPlan(manifest.subscriptionPlan);
  const lifetimePurchase = normalizeLifetimePurchase(manifest.lifetimePurchase);

  if (subscriptionPlan.key === lifetimePurchase.key) {
    throw new PaymentsConfigError({
      field: "lifetimePurchase.key",
      message: "lifetimePurchase.key must be different from subscriptionPlan.key.",
    });
  }

  return {
    projectKey,
    entitlementKey,
    allowPromotionCodes: manifest.allowPromotionCodes ?? true,
    subscriptionPlan,
    lifetimePurchase,
  };
}

export function stripePriceLookupKey(
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): string {
  const offering =
    offeringType === "subscription" ? manifest.subscriptionPlan : manifest.lifetimePurchase;

  return [
    "templar",
    slug(manifest.projectKey),
    slug(offering.key),
    priceFingerprint(manifest, offeringType),
  ].join("_");
}

export function priceFingerprint(
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): string {
  const offering =
    offeringType === "subscription" ? manifest.subscriptionPlan : manifest.lifetimePurchase;
  const price = offering.price;
  const cadence = offeringType === "subscription" ? manifest.subscriptionPlan.interval : "once";

  return `${price.currency}_${price.unitAmountCents}_${cadence}`;
}

export function metadataForOffering(
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): Record<string, string> {
  const offering =
    offeringType === "subscription" ? manifest.subscriptionPlan : manifest.lifetimePurchase;

  return {
    [paymentsMetadataKeys.entitlementKey]: manifest.entitlementKey,
    [paymentsMetadataKeys.offeringKey]: offering.key,
    [paymentsMetadataKeys.offeringType]: offeringType,
    [paymentsMetadataKeys.priceFingerprint]: priceFingerprint(manifest, offeringType),
    [paymentsMetadataKeys.projectKey]: manifest.projectKey,
  };
}

function normalizeSubscriptionPlan(
  plan: PaymentsSubscriptionPlanManifest,
): NormalizedPaymentsSubscriptionPlanManifest {
  const normalized = {
    ...plan,
    key: requireKey("subscriptionPlan.key", plan.key),
    name: requireNonEmpty("subscriptionPlan.name", plan.name),
    interval: plan.interval ?? "month",
    price: normalizePrice("subscriptionPlan.price", plan.price),
  };

  if (normalized.interval !== "month" && normalized.interval !== "year") {
    throw new PaymentsConfigError({
      field: "subscriptionPlan.interval",
      message: "subscriptionPlan.interval must be month or year.",
    });
  }

  if (plan.trial === undefined) {
    return normalized;
  }

  if (!Number.isInteger(plan.trial.days) || plan.trial.days < 1) {
    throw new PaymentsConfigError({
      field: "subscriptionPlan.trial.days",
      message: "subscriptionPlan.trial.days must be a positive integer.",
    });
  }

  return {
    ...normalized,
    trial: {
      days: plan.trial.days,
    },
  };
}

function normalizeLifetimePurchase(
  purchase: PaymentsLifetimePurchaseManifest,
): PaymentsLifetimePurchaseManifest {
  return {
    ...purchase,
    key: requireKey("lifetimePurchase.key", purchase.key),
    name: requireNonEmpty("lifetimePurchase.name", purchase.name),
    price: normalizePrice("lifetimePurchase.price", purchase.price),
  };
}

function normalizePrice(field: string, price: PaymentsPrice): PaymentsPrice {
  const currency = requireNonEmpty(`${field}.currency`, price.currency).toLowerCase();

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new PaymentsConfigError({
      field: `${field}.currency`,
      message: `${field}.currency must be a three-letter ISO currency code.`,
    });
  }

  if (!Number.isInteger(price.unitAmountCents) || price.unitAmountCents < 1) {
    throw new PaymentsConfigError({
      field: `${field}.unitAmountCents`,
      message: `${field}.unitAmountCents must be a positive integer.`,
    });
  }

  return {
    currency,
    unitAmountCents: price.unitAmountCents,
  };
}

function requireKey(field: string, value: string): string {
  const key = requireNonEmpty(field, value);

  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(key)) {
    throw new PaymentsConfigError({
      field,
      message: `${field} must contain only letters, numbers, underscores, or hyphens.`,
    });
  }

  return key;
}

function requireNonEmpty(field: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new PaymentsConfigError({
      field,
      message: `${field} must be a non-empty string.`,
    });
  }

  return trimmed;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
