import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentsConfigError } from "./errors.ts";
import { normalizePaymentsManifest, priceFingerprint, stripePriceLookupKey } from "./manifest.ts";

test("normalizes manifest defaults and price lookup keys", () => {
  const manifest = normalizePaymentsManifest({
    projectKey: "hello-world",
    entitlementKey: "premium",
    subscriptionPlan: {
      key: "pro",
      name: "Pro",
      price: {
        currency: "USD",
        unitAmountCents: 1200,
      },
    },
    lifetimePurchase: {
      key: "lifetime",
      name: "Lifetime",
      price: {
        currency: "usd",
        unitAmountCents: 9900,
      },
    },
  });

  assert.equal(manifest.allowPromotionCodes, true);
  assert.equal(manifest.subscriptionPlan.interval, "month");
  assert.equal(priceFingerprint(manifest, "subscription"), "usd_1200_month");
  assert.equal(
    stripePriceLookupKey(manifest, "lifetime"),
    "templar_hello_world_lifetime_usd_9900_once",
  );
});

test("rejects duplicate offering keys", () => {
  assert.throws(
    () =>
      normalizePaymentsManifest({
        projectKey: "app",
        entitlementKey: "premium",
        subscriptionPlan: {
          key: "pro",
          name: "Pro",
          price: {
            currency: "usd",
            unitAmountCents: 1200,
          },
        },
        lifetimePurchase: {
          key: "pro",
          name: "Lifetime",
          price: {
            currency: "usd",
            unitAmountCents: 9900,
          },
        },
      }),
    PaymentsConfigError,
  );
});
