import { createTemplarPayments, type PaymentsManifest } from "@templar/payments";
import { Effect } from "effect";
import * as schema from "../../../../db/schema.ts";
import { templarBindings } from "../../../../templar-bindings.ts";
import { getCurrentUser } from "./auth.server.ts";

export const swedishFiftyEntitlement = "swedish-fifty-premium";

export const paymentsManifest = {
  projectKey: "swedish-fifty",
  entitlementKey: swedishFiftyEntitlement,
  subscriptionPlan: {
    key: "daily-coach",
    name: "Swedish Fifty Premium",
    description: "Daily adaptive Swedish missions, voice practice, roleplay, and memory.",
    price: {
      currency: "usd",
      unitAmountCents: 1200,
    },
    interval: "month",
  },
  lifetimePurchase: {
    key: "trip-prep-pass",
    name: "Swedish Fifty Trip Prep Pass",
    description: "One-time access for this Sweden prep window.",
    price: {
      currency: "usd",
      unitAmountCents: 2900,
    },
  },
} satisfies PaymentsManifest;

type PaymentsEnv = {
  readonly [templarBindings.db]: D1Database;
  readonly [templarBindings.stripeSecretKey]: string;
  readonly [templarBindings.stripeWebhookSecret]: string;
};

export async function getPayments() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as PaymentsEnv;

  return createTemplarPayments({
    db: bindings[templarBindings.db],
    manifest: paymentsManifest,
    stripeSecretKey: bindings[templarBindings.stripeSecretKey],
    stripeWebhookSecret: bindings[templarBindings.stripeWebhookSecret],
    schema,
  });
}

export async function getPaymentsUser(request: Request) {
  const user = await getCurrentUser(request);

  if (user === null) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export async function userHasPremiumAccess(userId: string): Promise<boolean> {
  try {
    const payments = await getPayments();
    const result = await Effect.runPromise(
      payments.hasEntitlement({
        userId,
        entitlementKey: swedishFiftyEntitlement,
      }),
    );

    return result.allowed;
  } catch {
    return false;
  }
}
