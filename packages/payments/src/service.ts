import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { Context, Effect, Layer } from "effect";
import Stripe from "stripe";
import {
  type EntitlementGateResult,
  entitlementAllowsAccess,
  evaluateEntitlementAccess,
} from "./entitlements.ts";
import {
  PaymentsAccessError,
  PaymentsConfigError,
  type PaymentsError,
  PaymentsSetupError,
  PaymentsStorageError,
  PaymentsStripeError,
  PaymentsWebhookVerificationError,
} from "./errors.ts";
import {
  defaultPaymentsGracePeriodDays,
  metadataForOffering,
  type NormalizedPaymentsManifest,
  normalizePaymentsManifest,
  type PaymentsManifest,
  type PaymentsOfferingType,
  paymentsMetadataKeys,
  priceFingerprint,
  stripePriceLookupKey,
} from "./manifest.ts";
import {
  type PaymentEntitlementRecord,
  type PaymentsSchema,
  paymentsEntitlements,
  paymentsLifetimePurchases,
  paymentsProcessedStripeEvents,
  paymentsSchema,
  paymentsStripeCustomers,
  paymentsSubscriptions,
} from "./schema.ts";

export type PaymentsDatabaseSchema = Record<string, unknown>;
export type PaymentsDatabase = DrizzleD1Database<PaymentsSchema>;
type PaymentsTransaction = Parameters<Parameters<PaymentsDatabase["transaction"]>[0]>[0];
type PaymentsExecutor = PaymentsDatabase | PaymentsTransaction;

type StripeCustomerRecord = typeof paymentsStripeCustomers.$inferSelect;
type PaymentSubscriptionRecord = typeof paymentsSubscriptions.$inferSelect;
type PaymentLifetimePurchaseRecord = typeof paymentsLifetimePurchases.$inferSelect;

export type PaymentsUser = {
  readonly id: string;
  readonly email?: string;
};

export type StartCheckoutInput = {
  readonly user: PaymentsUser;
  readonly offering: PaymentsOfferingType;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly clientReferenceId?: string;
  readonly metadata?: Record<string, string>;
};

export type CheckoutSessionResult = {
  readonly id: string;
  readonly url: string;
};

export type CreateBillingPortalInput = {
  readonly userId: string;
  readonly returnUrl: string;
};

export type BillingPortalSessionResult = {
  readonly id: string;
  readonly url: string;
};

export type VerifyAndHandleWebhookInput = {
  readonly payload: string | ArrayBuffer | Uint8Array;
  readonly signature: string;
};

export type WebhookProcessingStatus = "processed" | "ignored" | "duplicate";

export type WebhookProcessingResult = {
  readonly eventId: string;
  readonly eventType: string;
  readonly objectId: string | null;
  readonly objectType: string | null;
  readonly status: WebhookProcessingStatus;
};

export type EntitlementQueryInput = {
  readonly userId: string;
  readonly entitlementKey?: string;
};

export type ListEntitlementsInput = EntitlementQueryInput & {
  readonly activeOnly?: boolean;
};

export type BillingSummary = {
  readonly customer: StripeCustomerRecord | null;
  readonly subscription: PaymentSubscriptionRecord | null;
  readonly lifetimePurchase: PaymentLifetimePurchaseRecord | null;
  readonly entitlements: readonly PaymentEntitlementRecord[];
};

export type ProvisionPaymentsInput = {
  readonly webhookUrl?: string;
  readonly webhookDescription?: string;
  readonly enabledEvents?: readonly Stripe.WebhookEndpointCreateParams.EnabledEvent[];
};

export type ProvisionedOffering = {
  readonly productId: string;
  readonly priceId: string;
  readonly lookupKey: string;
};

export type ProvisionPaymentsResult = {
  readonly subscription: ProvisionedOffering;
  readonly lifetime: ProvisionedOffering;
  readonly webhookEndpointId?: string;
};

export type PaymentsClock = {
  readonly now: () => Date;
  readonly randomId: () => string;
};

export type PaymentsService = {
  readonly manifest: NormalizedPaymentsManifest;
  readonly startCheckout: (
    input: StartCheckoutInput,
  ) => Effect.Effect<CheckoutSessionResult, PaymentsError>;
  readonly createBillingPortalSession: (
    input: CreateBillingPortalInput,
  ) => Effect.Effect<BillingPortalSessionResult, PaymentsError>;
  readonly verifyAndHandleWebhook: (
    input: VerifyAndHandleWebhookInput,
  ) => Effect.Effect<WebhookProcessingResult, PaymentsError>;
  readonly handleVerifiedStripeEvent: (
    event: Stripe.Event,
  ) => Effect.Effect<WebhookProcessingResult, PaymentsError>;
  readonly hasEntitlement: (
    input: EntitlementQueryInput,
  ) => Effect.Effect<EntitlementGateResult, PaymentsError>;
  readonly listEntitlements: (
    input: ListEntitlementsInput,
  ) => Effect.Effect<readonly PaymentEntitlementRecord[], PaymentsError>;
  readonly getBillingSummary: (userId: string) => Effect.Effect<BillingSummary, PaymentsError>;
  readonly provisionManifest: (
    input?: ProvisionPaymentsInput,
  ) => Effect.Effect<ProvisionPaymentsResult, PaymentsError>;
};

export class Payments extends Context.Tag("@templar/payments/Payments")<
  Payments,
  PaymentsService
>() {
  static readonly startCheckout = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.startCheckout,
  );
  static readonly createBillingPortalSession = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.createBillingPortalSession,
  );
  static readonly verifyAndHandleWebhook = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.verifyAndHandleWebhook,
  );
  static readonly handleVerifiedStripeEvent = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.handleVerifiedStripeEvent,
  );
  static readonly hasEntitlement = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.hasEntitlement,
  );
  static readonly listEntitlements = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.listEntitlements,
  );
  static readonly getBillingSummary = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.getBillingSummary,
  );
  static readonly provisionManifest = Effect.serviceFunctionEffect(
    this,
    (payments) => payments.provisionManifest,
  );
}

export type TemplarPaymentsConfig<TSchema extends PaymentsDatabaseSchema = PaymentsDatabaseSchema> =
  {
    readonly db: D1Database;
    readonly manifest: PaymentsManifest;
    readonly stripeSecretKey: string;
    readonly stripeWebhookSecret?: string;
    readonly schema?: TSchema;
    readonly drizzle?: Omit<DrizzleConfig<TSchema & PaymentsSchema>, "schema">;
    readonly stripe?: Stripe;
    readonly gracePeriodDays?: number;
    readonly webhookToleranceSeconds?: number;
    readonly clock?: Partial<PaymentsClock>;
  };

export type PaymentsServiceInput = {
  readonly db: PaymentsDatabase;
  readonly manifest: NormalizedPaymentsManifest | PaymentsManifest;
  readonly stripe: Stripe;
  readonly webhookSecret?: string;
  readonly gracePeriodDays?: number;
  readonly webhookToleranceSeconds?: number;
  readonly clock?: Partial<PaymentsClock>;
};

export function createTemplarPayments<TSchema extends PaymentsDatabaseSchema>(
  config: TemplarPaymentsConfig<TSchema>,
): PaymentsService {
  const schema = {
    ...paymentsSchema,
    ...config.schema,
  } as TSchema & PaymentsSchema;
  const db = drizzle(config.db, {
    ...config.drizzle,
    schema,
  }) as unknown as PaymentsDatabase;

  return makePaymentsService({
    db,
    manifest: config.manifest,
    stripe:
      config.stripe ?? new Stripe(requireConfigValue("stripeSecretKey", config.stripeSecretKey)),
    ...(config.stripeWebhookSecret === undefined
      ? {}
      : { webhookSecret: config.stripeWebhookSecret }),
    ...(config.gracePeriodDays === undefined ? {} : { gracePeriodDays: config.gracePeriodDays }),
    ...(config.webhookToleranceSeconds === undefined
      ? {}
      : { webhookToleranceSeconds: config.webhookToleranceSeconds }),
    ...(config.clock === undefined ? {} : { clock: config.clock }),
  });
}

export function makePaymentsLayer(service: PaymentsService): Layer.Layer<Payments> {
  return Layer.succeed(Payments, service);
}

export function paymentsLayer(input: PaymentsServiceInput): Layer.Layer<Payments> {
  return makePaymentsLayer(makePaymentsService(input));
}

export function makePaymentsService(input: PaymentsServiceInput): PaymentsService {
  const manifest = normalizePaymentsManifest(input.manifest as PaymentsManifest);
  const clock: PaymentsClock = {
    now: input.clock?.now ?? (() => new Date()),
    randomId: input.clock?.randomId ?? (() => crypto.randomUUID()),
  };
  const gracePeriodDays = input.gracePeriodDays ?? defaultPaymentsGracePeriodDays;
  const webhookToleranceSeconds = input.webhookToleranceSeconds;

  const service: PaymentsService = {
    manifest,
    startCheckout: (checkoutInput) =>
      Effect.gen(function* () {
        yield* assertUser(checkoutInput.user);
        yield* assertCheckoutAllowed(
          input.db,
          manifest,
          checkoutInput.offering,
          checkoutInput.user.id,
          clock,
        );

        const priceId = yield* findActivePriceId(input.stripe, manifest, checkoutInput.offering);
        const customer = yield* ensureStripeCustomer(
          input.db,
          input.stripe,
          manifest,
          checkoutInput.user,
          clock,
        );
        const metadata = checkoutMetadata(manifest, checkoutInput);
        const sessionInput = checkoutSessionCreateParams(
          manifest,
          checkoutInput,
          customer.stripeCustomerId,
          priceId,
          metadata,
        );
        const session = yield* stripeEffect("checkout.sessions.create", () =>
          input.stripe.checkout.sessions.create(sessionInput),
        );

        return {
          id: session.id,
          url: session.url ?? "",
        };
      }),

    createBillingPortalSession: (portalInput) =>
      Effect.gen(function* () {
        const customer = yield* findStripeCustomerByUser(input.db, portalInput.userId);

        if (customer === null) {
          return yield* Effect.fail(new PaymentsAccessError({ reason: "customer-not-found" }));
        }

        const session = yield* stripeEffect("billingPortal.sessions.create", () =>
          input.stripe.billingPortal.sessions.create({
            customer: customer.stripeCustomerId,
            return_url: portalInput.returnUrl,
          }),
        );

        return {
          id: session.id,
          url: session.url,
        };
      }),

    verifyAndHandleWebhook: (webhookInput) =>
      Effect.gen(function* () {
        if (input.webhookSecret === undefined || input.webhookSecret.trim() === "") {
          return yield* Effect.fail(new PaymentsSetupError({ reason: "missing-webhook-secret" }));
        }

        const webhookSecret = input.webhookSecret;
        const payload = normalizeWebhookPayload(webhookInput.payload);
        const event = yield* Effect.try({
          try: () =>
            input.stripe.webhooks.constructEvent(
              payload,
              webhookInput.signature,
              webhookSecret,
              webhookToleranceSeconds,
            ),
          catch: (cause) => new PaymentsWebhookVerificationError({ cause }),
        });

        return yield* service.handleVerifiedStripeEvent(event);
      }),

    handleVerifiedStripeEvent: (event) =>
      dbEffect("process stripe event", () =>
        processStripeEvent(input.db, input.stripe, manifest, event, clock, gracePeriodDays),
      ),

    hasEntitlement: (queryInput) =>
      Effect.gen(function* () {
        const entitlements = yield* findEntitlements(input.db, {
          userId: queryInput.userId,
          entitlementKey: queryInput.entitlementKey ?? manifest.entitlementKey,
          activeOnly: false,
        });

        return evaluateEntitlementAccess(entitlements, clock.now());
      }),

    listEntitlements: (queryInput) =>
      findEntitlements(input.db, {
        userId: queryInput.userId,
        entitlementKey: queryInput.entitlementKey ?? manifest.entitlementKey,
        activeOnly: queryInput.activeOnly ?? true,
      }),

    getBillingSummary: (userId) =>
      Effect.gen(function* () {
        const [customer, subscription, lifetimePurchase, entitlements] = yield* Effect.all(
          [
            findStripeCustomerByUser(input.db, userId),
            findLatestSubscription(input.db, userId),
            findLatestLifetimePurchase(input.db, userId),
            findEntitlements(input.db, {
              userId,
              entitlementKey: manifest.entitlementKey,
              activeOnly: false,
            }),
          ],
          { concurrency: "unbounded" },
        );

        return {
          customer,
          subscription,
          lifetimePurchase,
          entitlements,
        };
      }),

    provisionManifest: (provisionInput) =>
      Effect.gen(function* () {
        const subscription = yield* provisionOffering(input.stripe, manifest, "subscription");
        const lifetime = yield* provisionOffering(input.stripe, manifest, "lifetime");
        const webhookUrl = provisionInput?.webhookUrl;
        const webhookEndpointId =
          webhookUrl === undefined
            ? undefined
            : yield* provisionWebhookEndpoint(input.stripe, manifest, {
                ...provisionInput,
                webhookUrl,
              });

        return {
          subscription,
          lifetime,
          ...(webhookEndpointId === undefined ? {} : { webhookEndpointId }),
        };
      }),
  };

  return service;
}

async function processStripeEvent(
  db: PaymentsDatabase,
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  event: Stripe.Event,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<WebhookProcessingResult> {
  const object = event.data.object;
  const objectId = stripeObjectId(object);
  const objectType = stripeObjectType(object);
  const existing = await db
    .select()
    .from(paymentsProcessedStripeEvents)
    .where(eq(paymentsProcessedStripeEvents.stripeEventId, event.id))
    .limit(1);

  if (existing[0] !== undefined) {
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      objectType,
      status: "duplicate",
    };
  }

  return await db.transaction(async (tx) => {
    const duplicate = await tx
      .select()
      .from(paymentsProcessedStripeEvents)
      .where(eq(paymentsProcessedStripeEvents.stripeEventId, event.id))
      .limit(1);

    if (duplicate[0] !== undefined) {
      return {
        eventId: event.id,
        eventType: event.type,
        objectId,
        objectType,
        status: "duplicate",
      };
    }

    const status = await applyStripeEvent(tx, stripe, manifest, event, clock, gracePeriodDays);
    const now = clock.now();

    await tx.insert(paymentsProcessedStripeEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      objectId,
      objectType,
      processingStatus: status,
      receivedAt: now,
      processedAt: now,
    });

    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      objectType,
      status,
    };
  });
}

async function applyStripeEvent(
  tx: PaymentsTransaction,
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  event: Stripe.Event,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<Exclude<WebhookProcessingStatus, "duplicate">> {
  switch (event.type) {
    case "checkout.session.completed":
      return await applyCheckoutCompleted(
        tx,
        stripe,
        manifest,
        event.data.object as Stripe.Checkout.Session,
        clock,
        gracePeriodDays,
      );
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end":
      return await applySubscriptionEvent(
        tx,
        manifest,
        event.data.object as Stripe.Subscription,
        clock,
        gracePeriodDays,
      );
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      return await applyInvoiceEvent(
        tx,
        stripe,
        manifest,
        event.data.object as Stripe.Invoice,
        clock,
        gracePeriodDays,
      );
    default:
      return "ignored";
  }
}

async function applyCheckoutCompleted(
  tx: PaymentsTransaction,
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  session: Stripe.Checkout.Session,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<Exclude<WebhookProcessingStatus, "duplicate">> {
  if (!metadataMatchesProject(session.metadata, manifest)) {
    return "ignored";
  }

  const userId = session.metadata?.[paymentsMetadataKeys.userId];
  const stripeCustomerId = stripeId(session.customer);

  if (userId === undefined || stripeCustomerId === null) {
    return "ignored";
  }

  await upsertStripeCustomer(tx, manifest, {
    stripeCustomerId,
    userId,
    userEmail: session.customer_details?.email ?? null,
    now: clock.now(),
    randomId: clock.randomId,
  });

  if (
    session.mode === "payment" &&
    session.metadata?.[paymentsMetadataKeys.checkoutType] === "lifetime" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required")
  ) {
    await grantLifetimePurchase(tx, manifest, session, userId, stripeCustomerId, clock);
    return "processed";
  }

  const stripeSubscriptionId = stripeId(session.subscription);

  if (session.mode === "subscription" && stripeSubscriptionId !== null) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    await applySubscription(tx, manifest, subscription, clock, gracePeriodDays);
    return "processed";
  }

  return "ignored";
}

async function applySubscriptionEvent(
  tx: PaymentsTransaction,
  manifest: NormalizedPaymentsManifest,
  subscription: Stripe.Subscription,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<Exclude<WebhookProcessingStatus, "duplicate">> {
  if (!(await subscriptionBelongsToProject(tx, subscription, manifest))) {
    return "ignored";
  }

  await applySubscription(tx, manifest, subscription, clock, gracePeriodDays);
  return "processed";
}

async function applyInvoiceEvent(
  tx: PaymentsTransaction,
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  invoice: Stripe.Invoice,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<Exclude<WebhookProcessingStatus, "duplicate">> {
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (subscriptionId === null) {
    return "ignored";
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  if (!(await subscriptionBelongsToProject(tx, subscription, manifest))) {
    return "ignored";
  }

  await applySubscription(tx, manifest, subscription, clock, gracePeriodDays);
  return "processed";
}

async function applySubscription(
  tx: PaymentsTransaction,
  manifest: NormalizedPaymentsManifest,
  subscription: Stripe.Subscription,
  clock: PaymentsClock,
  gracePeriodDays: number,
): Promise<void> {
  const existing = await findSubscriptionByStripeId(tx, subscription.id);
  const stripeCustomerId = stripeId(subscription.customer);
  const userId = await resolveSubscriptionUserId(tx, subscription, existing, stripeCustomerId);

  if (stripeCustomerId === null || userId === null) {
    return;
  }

  const now = clock.now();
  const access = subscriptionAccess(subscription, existing, now, gracePeriodDays);
  const priceId = subscription.items.data[0]?.price.id ?? existing?.stripePriceId ?? null;

  await upsertStripeCustomer(tx, manifest, {
    stripeCustomerId,
    userId,
    userEmail: null,
    now,
    randomId: clock.randomId,
  });

  await tx
    .insert(paymentsSubscriptions)
    .values({
      id: existing?.id ?? clock.randomId(),
      projectKey: manifest.projectKey,
      userId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      planKey: manifest.subscriptionPlan.key,
      entitlementKey: manifest.entitlementKey,
      status: subscription.status,
      accessStatus: access.accessStatus,
      trialEndsAt: fromUnixSeconds(subscription.trial_end),
      currentPeriodEndsAt: access.currentPeriodEndsAt,
      graceEndsAt: access.graceEndsAt,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: fromUnixSeconds(subscription.canceled_at),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: paymentsSubscriptions.stripeSubscriptionId,
      set: {
        userId,
        stripeCustomerId,
        stripePriceId: priceId,
        planKey: manifest.subscriptionPlan.key,
        entitlementKey: manifest.entitlementKey,
        status: subscription.status,
        accessStatus: access.accessStatus,
        trialEndsAt: fromUnixSeconds(subscription.trial_end),
        currentPeriodEndsAt: access.currentPeriodEndsAt,
        graceEndsAt: access.graceEndsAt,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: fromUnixSeconds(subscription.canceled_at),
        updatedAt: now,
      },
    });

  await upsertEntitlement(tx, {
    id: `subscription:${subscription.id}`,
    projectKey: manifest.projectKey,
    userId,
    entitlementKey: manifest.entitlementKey,
    sourceType: "subscription",
    sourceId: subscription.id,
    accessStatus: access.accessStatus,
    accessKind: access.accessKind,
    active: access.active,
    startsAt: fromUnixSeconds(subscription.start_date) ?? now,
    expiresAt: access.expiresAt,
    now,
  });
}

async function grantLifetimePurchase(
  tx: PaymentsTransaction,
  manifest: NormalizedPaymentsManifest,
  session: Stripe.Checkout.Session,
  userId: string,
  stripeCustomerId: string,
  clock: PaymentsClock,
): Promise<void> {
  const now = clock.now();
  const existing = await tx
    .select()
    .from(paymentsLifetimePurchases)
    .where(eq(paymentsLifetimePurchases.stripeCheckoutSessionId, session.id))
    .limit(1);
  const paymentIntentId = stripeId(session.payment_intent);

  await tx
    .insert(paymentsLifetimePurchases)
    .values({
      id: existing[0]?.id ?? clock.randomId(),
      projectKey: manifest.projectKey,
      userId,
      stripeCustomerId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      stripePriceId: null,
      purchaseKey: manifest.lifetimePurchase.key,
      entitlementKey: manifest.entitlementKey,
      purchasedAt: now,
      createdAt: existing[0]?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: paymentsLifetimePurchases.stripeCheckoutSessionId,
      set: {
        userId,
        stripeCustomerId,
        stripePaymentIntentId: paymentIntentId,
        updatedAt: now,
      },
    });

  await upsertEntitlement(tx, {
    id: `lifetime:${session.id}`,
    projectKey: manifest.projectKey,
    userId,
    entitlementKey: manifest.entitlementKey,
    sourceType: "lifetime_purchase",
    sourceId: session.id,
    accessStatus: "active",
    accessKind: "lifetime",
    active: true,
    startsAt: now,
    expiresAt: null,
    now,
  });
}

async function upsertEntitlement(
  tx: PaymentsTransaction,
  entitlement: {
    readonly id: string;
    readonly projectKey: string;
    readonly userId: string;
    readonly entitlementKey: string;
    readonly sourceType: string;
    readonly sourceId: string;
    readonly accessStatus: string;
    readonly accessKind: string;
    readonly active: boolean;
    readonly startsAt: Date;
    readonly expiresAt: Date | null;
    readonly now: Date;
  },
): Promise<void> {
  await tx
    .insert(paymentsEntitlements)
    .values({
      id: entitlement.id,
      projectKey: entitlement.projectKey,
      userId: entitlement.userId,
      entitlementKey: entitlement.entitlementKey,
      sourceType: entitlement.sourceType,
      sourceId: entitlement.sourceId,
      accessStatus: entitlement.accessStatus,
      accessKind: entitlement.accessKind,
      active: entitlement.active,
      startsAt: entitlement.startsAt,
      expiresAt: entitlement.expiresAt,
      createdAt: entitlement.now,
      updatedAt: entitlement.now,
    })
    .onConflictDoUpdate({
      target: [paymentsEntitlements.sourceType, paymentsEntitlements.sourceId],
      set: {
        userId: entitlement.userId,
        entitlementKey: entitlement.entitlementKey,
        accessStatus: entitlement.accessStatus,
        accessKind: entitlement.accessKind,
        active: entitlement.active,
        startsAt: entitlement.startsAt,
        expiresAt: entitlement.expiresAt,
        updatedAt: entitlement.now,
      },
    });
}

async function resolveSubscriptionUserId(
  tx: PaymentsTransaction,
  subscription: Stripe.Subscription,
  existing: PaymentSubscriptionRecord | null,
  stripeCustomerId: string | null,
): Promise<string | null> {
  const metadataUserId = subscription.metadata[paymentsMetadataKeys.userId];

  if (metadataUserId !== undefined && metadataUserId.trim() !== "") {
    return metadataUserId;
  }

  if (existing !== null) {
    return existing.userId;
  }

  if (stripeCustomerId === null) {
    return null;
  }

  const customers = await tx
    .select()
    .from(paymentsStripeCustomers)
    .where(eq(paymentsStripeCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);

  return customers[0]?.userId ?? null;
}

async function subscriptionBelongsToProject(
  tx: PaymentsTransaction,
  subscription: Stripe.Subscription,
  manifest: NormalizedPaymentsManifest,
): Promise<boolean> {
  if (metadataMatchesProject(subscription.metadata, manifest)) {
    return true;
  }

  const existing = await findSubscriptionByStripeId(tx, subscription.id);

  return existing?.projectKey === manifest.projectKey;
}

function subscriptionAccess(
  subscription: Stripe.Subscription,
  existing: PaymentSubscriptionRecord | null,
  now: Date,
  gracePeriodDays: number,
): {
  readonly accessStatus: string;
  readonly accessKind: string;
  readonly active: boolean;
  readonly currentPeriodEndsAt: Date | null;
  readonly graceEndsAt: Date | null;
  readonly expiresAt: Date | null;
} {
  const currentPeriodEndsAt = subscriptionCurrentPeriodEnd(subscription);

  switch (subscription.status) {
    case "trialing":
      return {
        accessStatus: "active",
        accessKind: "trial",
        active: true,
        currentPeriodEndsAt,
        graceEndsAt: null,
        expiresAt: fromUnixSeconds(subscription.trial_end) ?? currentPeriodEndsAt,
      };
    case "active":
      return {
        accessStatus: "active",
        accessKind: "subscription",
        active: true,
        currentPeriodEndsAt,
        graceEndsAt: null,
        expiresAt: currentPeriodEndsAt,
      };
    case "past_due":
    case "unpaid": {
      const existingGrace = existing?.graceEndsAt ?? null;
      const graceEndsAt =
        existingGrace !== null && existingGrace > now
          ? existingGrace
          : addDays(now, gracePeriodDays);

      return {
        accessStatus: "grace",
        accessKind: "subscription",
        active: true,
        currentPeriodEndsAt,
        graceEndsAt,
        expiresAt: graceEndsAt,
      };
    }
    default:
      return {
        accessStatus: "inactive",
        accessKind: "subscription",
        active: false,
        currentPeriodEndsAt,
        graceEndsAt: null,
        expiresAt: now,
      };
  }
}

function checkoutSessionCreateParams(
  manifest: NormalizedPaymentsManifest,
  input: StartCheckoutInput,
  stripeCustomerId: string,
  priceId: string,
  metadata: Record<string, string>,
): Stripe.Checkout.SessionCreateParams {
  const base = {
    allow_promotion_codes: manifest.allowPromotionCodes,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId ?? input.user.id,
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata,
    success_url: input.successUrl,
  };

  if (input.offering === "subscription") {
    const trial = manifest.subscriptionPlan.trial;

    return {
      ...base,
      mode: "subscription",
      ...(trial === undefined
        ? {}
        : {
            payment_method_collection: "always",
            subscription_data: {
              metadata,
              trial_period_days: trial.days,
              trial_settings: {
                end_behavior: {
                  missing_payment_method: "cancel",
                },
              },
            },
          }),
      ...(trial === undefined
        ? {
            subscription_data: {
              metadata,
            },
          }
        : {}),
    };
  }

  return {
    ...base,
    mode: "payment",
    payment_intent_data: {
      metadata,
    },
  };
}

function checkoutMetadata(
  manifest: NormalizedPaymentsManifest,
  input: StartCheckoutInput,
): Record<string, string> {
  return {
    ...input.metadata,
    ...metadataForOffering(manifest, input.offering),
    [paymentsMetadataKeys.checkoutType]: input.offering,
    [paymentsMetadataKeys.userId]: input.user.id,
  };
}

function ensureStripeCustomer(
  db: PaymentsDatabase,
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  user: PaymentsUser,
  clock: PaymentsClock,
): Effect.Effect<StripeCustomerRecord, PaymentsError> {
  return Effect.gen(function* () {
    const existing = yield* findStripeCustomerByUser(db, user.id);

    if (existing !== null) {
      return existing;
    }

    const customer = yield* stripeEffect("customers.create", () =>
      stripe.customers.create({
        ...(user.email === undefined ? {} : { email: user.email }),
        metadata: {
          [paymentsMetadataKeys.projectKey]: manifest.projectKey,
          [paymentsMetadataKeys.userId]: user.id,
        },
      }),
    );
    const now = clock.now();

    yield* dbEffect("insert stripe customer", () =>
      db
        .insert(paymentsStripeCustomers)
        .values({
          id: clock.randomId(),
          projectKey: manifest.projectKey,
          userId: user.id,
          userEmail: user.email ?? null,
          stripeCustomerId: customer.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: paymentsStripeCustomers.userId }),
    );

    return (
      (yield* findStripeCustomerByUser(db, user.id)) ?? {
        id: clock.randomId(),
        projectKey: manifest.projectKey,
        userId: user.id,
        userEmail: user.email ?? null,
        stripeCustomerId: customer.id,
        createdAt: now,
        updatedAt: now,
      }
    );
  });
}

async function upsertStripeCustomer(
  tx: PaymentsTransaction,
  manifest: NormalizedPaymentsManifest,
  input: {
    readonly stripeCustomerId: string;
    readonly userId: string;
    readonly userEmail: string | null;
    readonly now: Date;
    readonly randomId: () => string;
  },
): Promise<void> {
  const existing = await tx
    .select()
    .from(paymentsStripeCustomers)
    .where(eq(paymentsStripeCustomers.stripeCustomerId, input.stripeCustomerId))
    .limit(1);

  await tx
    .insert(paymentsStripeCustomers)
    .values({
      id: existing[0]?.id ?? input.randomId(),
      projectKey: manifest.projectKey,
      userId: input.userId,
      userEmail: input.userEmail,
      stripeCustomerId: input.stripeCustomerId,
      createdAt: existing[0]?.createdAt ?? input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: paymentsStripeCustomers.stripeCustomerId,
      set: {
        userId: input.userId,
        userEmail: input.userEmail,
        updatedAt: input.now,
      },
    });
}

function assertUser(user: PaymentsUser): Effect.Effect<void, PaymentsAccessError> {
  if (user.id.trim() !== "") {
    return Effect.void;
  }

  return Effect.fail(new PaymentsAccessError({ reason: "missing-user" }));
}

function assertCheckoutAllowed(
  db: PaymentsDatabase,
  manifest: NormalizedPaymentsManifest,
  offering: PaymentsOfferingType,
  userId: string,
  clock: PaymentsClock,
): Effect.Effect<void, PaymentsError> {
  return Effect.gen(function* () {
    const entitlements = yield* findEntitlements(db, {
      userId,
      entitlementKey: manifest.entitlementKey,
      activeOnly: false,
    });
    const active = entitlements.find((entitlement) =>
      entitlementAllowsAccess(entitlement, clock.now()),
    );

    if (active === undefined) {
      return;
    }

    if (active.sourceType === "lifetime_purchase") {
      return yield* Effect.fail(new PaymentsAccessError({ reason: "active-lifetime-entitlement" }));
    }

    if (offering === "subscription" || active.sourceType === "subscription") {
      return yield* Effect.fail(new PaymentsAccessError({ reason: "active-subscription" }));
    }
  });
}

function findStripeCustomerByUser(
  db: PaymentsExecutor,
  userId: string,
): Effect.Effect<StripeCustomerRecord | null, PaymentsStorageError> {
  return dbEffect("select stripe customer", async () => {
    const rows = await db
      .select()
      .from(paymentsStripeCustomers)
      .where(eq(paymentsStripeCustomers.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  });
}

function findLatestSubscription(
  db: PaymentsExecutor,
  userId: string,
): Effect.Effect<PaymentSubscriptionRecord | null, PaymentsStorageError> {
  return dbEffect("select subscription", async () => {
    const rows = await db
      .select()
      .from(paymentsSubscriptions)
      .where(eq(paymentsSubscriptions.userId, userId))
      .orderBy(desc(paymentsSubscriptions.updatedAt))
      .limit(1);

    return rows[0] ?? null;
  });
}

async function findSubscriptionByStripeId(
  db: PaymentsExecutor,
  stripeSubscriptionId: string,
): Promise<PaymentSubscriptionRecord | null> {
  const rows = await db
    .select()
    .from(paymentsSubscriptions)
    .where(eq(paymentsSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  return rows[0] ?? null;
}

function findLatestLifetimePurchase(
  db: PaymentsExecutor,
  userId: string,
): Effect.Effect<PaymentLifetimePurchaseRecord | null, PaymentsStorageError> {
  return dbEffect("select lifetime purchase", async () => {
    const rows = await db
      .select()
      .from(paymentsLifetimePurchases)
      .where(eq(paymentsLifetimePurchases.userId, userId))
      .orderBy(desc(paymentsLifetimePurchases.purchasedAt))
      .limit(1);

    return rows[0] ?? null;
  });
}

function findEntitlements(
  db: PaymentsExecutor,
  input: Required<ListEntitlementsInput>,
): Effect.Effect<readonly PaymentEntitlementRecord[], PaymentsStorageError> {
  return dbEffect("select entitlements", () => {
    const baseConditions = [
      eq(paymentsEntitlements.userId, input.userId),
      eq(paymentsEntitlements.entitlementKey, input.entitlementKey),
    ];
    const conditions = input.activeOnly
      ? [
          ...baseConditions,
          eq(paymentsEntitlements.active, true),
          or(
            isNull(paymentsEntitlements.expiresAt),
            gt(paymentsEntitlements.expiresAt, new Date()),
          ),
        ]
      : baseConditions;

    return db
      .select()
      .from(paymentsEntitlements)
      .where(and(...conditions))
      .orderBy(desc(paymentsEntitlements.updatedAt));
  });
}

function findActivePriceId(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): Effect.Effect<string, PaymentsError> {
  return Effect.gen(function* () {
    const lookupKey = stripePriceLookupKey(manifest, offeringType);
    const prices = yield* stripeEffect("prices.list", () =>
      stripe.prices.list({
        active: true,
        limit: 1,
        lookup_keys: [lookupKey],
      }),
    );
    const price = prices.data[0];

    if (price === undefined) {
      return yield* Effect.fail(
        new PaymentsSetupError({
          reason: "missing-price",
          offeringKey:
            offeringType === "subscription"
              ? manifest.subscriptionPlan.key
              : manifest.lifetimePurchase.key,
        }),
      );
    }

    return price.id;
  });
}

function provisionOffering(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): Effect.Effect<ProvisionedOffering, PaymentsStripeError> {
  return Effect.gen(function* () {
    const product = yield* findOrCreateProduct(stripe, manifest, offeringType);
    const price = yield* findOrCreatePrice(stripe, manifest, offeringType, product.id);

    yield* deactivateOldPrices(stripe, manifest, offeringType, product.id, price.id);

    return {
      productId: product.id,
      priceId: price.id,
      lookupKey: stripePriceLookupKey(manifest, offeringType),
    };
  });
}

function findOrCreateProduct(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): Effect.Effect<Stripe.Product, PaymentsStripeError> {
  return Effect.gen(function* () {
    const offering =
      offeringType === "subscription" ? manifest.subscriptionPlan : manifest.lifetimePurchase;
    const metadata = metadataForProduct(manifest, offeringType);
    const query = stripeMetadataSearchQuery(metadata);
    const existing = yield* stripeEffect("products.search", () =>
      stripe.products.search({
        query,
        limit: 1,
      }),
    );
    const product = existing.data[0];

    if (product !== undefined) {
      return yield* stripeEffect("products.update", () =>
        stripe.products.update(product.id, {
          name: offering.name,
          ...(offering.description === undefined ? {} : { description: offering.description }),
          metadata,
        }),
      );
    }

    return yield* stripeEffect("products.create", () =>
      stripe.products.create({
        name: offering.name,
        ...(offering.description === undefined ? {} : { description: offering.description }),
        metadata,
      }),
    );
  });
}

function metadataForProduct(
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
): Record<string, string> {
  const productMetadata = metadataForOffering(manifest, offeringType);
  delete productMetadata[paymentsMetadataKeys.priceFingerprint];

  return productMetadata;
}

function findOrCreatePrice(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
  productId: string,
): Effect.Effect<Stripe.Price, PaymentsStripeError> {
  return Effect.gen(function* () {
    const lookupKey = stripePriceLookupKey(manifest, offeringType);
    const existingByLookup = yield* stripeEffect("prices.list", () =>
      stripe.prices.list({
        active: true,
        limit: 1,
        lookup_keys: [lookupKey],
      }),
    );
    const price = existingByLookup.data[0];

    if (price !== undefined) {
      return price;
    }

    const offering =
      offeringType === "subscription" ? manifest.subscriptionPlan : manifest.lifetimePurchase;
    const metadata = metadataForOffering(manifest, offeringType);
    const createParams: Stripe.PriceCreateParams = {
      active: true,
      currency: offering.price.currency,
      lookup_key: lookupKey,
      metadata,
      product: productId,
      unit_amount: offering.price.unitAmountCents,
      ...(offeringType === "subscription"
        ? {
            recurring: {
              interval: manifest.subscriptionPlan.interval,
            },
          }
        : {}),
    };

    return yield* stripeEffect("prices.create", () => stripe.prices.create(createParams));
  });
}

function deactivateOldPrices(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  offeringType: PaymentsOfferingType,
  productId: string,
  activePriceId: string,
): Effect.Effect<void, PaymentsStripeError> {
  return Effect.gen(function* () {
    const activePrices = yield* stripeEffect("prices.list", () =>
      stripe.prices.list({
        active: true,
        limit: 100,
        product: productId,
      }),
    );
    const currentFingerprint = priceFingerprint(manifest, offeringType);

    for (const price of activePrices.data) {
      if (
        price.id !== activePriceId &&
        price.metadata[paymentsMetadataKeys.projectKey] === manifest.projectKey &&
        price.metadata[paymentsMetadataKeys.offeringType] === offeringType &&
        price.metadata[paymentsMetadataKeys.priceFingerprint] !== currentFingerprint
      ) {
        yield* stripeEffect("prices.update", () =>
          stripe.prices.update(price.id, {
            active: false,
          }),
        );
      }
    }
  });
}

function provisionWebhookEndpoint(
  stripe: Stripe,
  manifest: NormalizedPaymentsManifest,
  input: ProvisionPaymentsInput & { readonly webhookUrl: string },
): Effect.Effect<string, PaymentsStripeError> {
  return Effect.gen(function* () {
    const metadata = {
      [paymentsMetadataKeys.projectKey]: manifest.projectKey,
    };
    const enabledEvents = [...(input.enabledEvents ?? defaultWebhookEvents)];
    const endpoints = yield* stripeEffect("webhookEndpoints.list", () =>
      stripe.webhookEndpoints.list({ limit: 100 }),
    );
    const existing = endpoints.data.find(
      (endpoint) =>
        endpoint.url === input.webhookUrl &&
        endpoint.metadata[paymentsMetadataKeys.projectKey] === manifest.projectKey,
    );

    if (existing !== undefined) {
      const updated = yield* stripeEffect("webhookEndpoints.update", () =>
        stripe.webhookEndpoints.update(existing.id, {
          disabled: false,
          enabled_events: enabledEvents,
          metadata,
          ...(input.webhookDescription === undefined
            ? {}
            : { description: input.webhookDescription }),
        }),
      );

      return updated.id;
    }

    const created = yield* stripeEffect("webhookEndpoints.create", () =>
      stripe.webhookEndpoints.create({
        enabled_events: enabledEvents,
        metadata,
        url: input.webhookUrl,
        ...(input.webhookDescription === undefined
          ? {}
          : { description: input.webhookDescription }),
      }),
    );

    return created.id;
  });
}

const defaultWebhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] satisfies readonly Stripe.WebhookEndpointCreateParams.EnabledEvent[];

function dbEffect<A>(
  operation: string,
  f: () => Promise<A>,
): Effect.Effect<A, PaymentsStorageError> {
  return Effect.tryPromise({
    try: f,
    catch: (cause) => new PaymentsStorageError({ operation, cause }),
  });
}

function stripeEffect<A>(
  operation: string,
  f: () => Promise<A>,
): Effect.Effect<A, PaymentsStripeError> {
  return Effect.tryPromise({
    try: f,
    catch: (cause) => new PaymentsStripeError({ operation, cause }),
  });
}

function metadataMatchesProject(
  metadata: Stripe.Metadata | null,
  manifest: NormalizedPaymentsManifest,
): boolean {
  return metadata?.[paymentsMetadataKeys.projectKey] === manifest.projectKey;
}

function stripeMetadataSearchQuery(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `metadata['${key}']:'${stripeSearchEscape(value)}'`)
    .join(" AND ");
}

function stripeSearchEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeWebhookPayload(payload: string | ArrayBuffer | Uint8Array): string {
  if (typeof payload === "string") {
    return payload;
  }

  return new TextDecoder().decode(payload);
}

function stripeObjectId(object: Stripe.Event.Data.Object): string | null {
  return hasStringProperty(object, "id") ? object.id : null;
}

function stripeObjectType(object: Stripe.Event.Data.Object): string | null {
  return hasStringProperty(object, "object") ? object.object : null;
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { readonly id?: unknown }).id;

    return typeof id === "string" ? id : null;
  }

  return null;
}

function hasStringProperty<T extends string>(
  value: unknown,
  property: T,
): value is Record<T, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    property in value &&
    typeof (value as Record<T, unknown>)[property] === "string"
  );
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;

  if (parent?.type === "subscription_details") {
    return stripeId(parent.subscription_details?.subscription);
  }

  return stripeId((invoice as unknown as { readonly subscription?: unknown }).subscription);
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const itemPeriodEnd = subscription.items.data[0]?.current_period_end;

  if (itemPeriodEnd !== undefined) {
    return fromUnixSeconds(itemPeriodEnd);
  }

  return fromUnixSeconds(
    (subscription as unknown as { readonly current_period_end?: unknown }).current_period_end,
  );
}

function fromUnixSeconds(value: unknown): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function requireConfigValue(field: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new PaymentsConfigError({
      field,
      message: `${field} must be a non-empty string.`,
    });
  }

  return trimmed;
}
