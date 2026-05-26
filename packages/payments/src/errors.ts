import { Data } from "effect";

export class PaymentsConfigError extends Data.TaggedError("PaymentsConfigError")<{
  readonly field: string;
  readonly message: string;
}> {}

export class PaymentsStorageError extends Data.TaggedError("PaymentsStorageError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export class PaymentsStripeError extends Data.TaggedError("PaymentsStripeError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export class PaymentsWebhookVerificationError extends Data.TaggedError(
  "PaymentsWebhookVerificationError",
)<{
  readonly cause: unknown;
}> {}

export class PaymentsSetupError extends Data.TaggedError("PaymentsSetupError")<{
  readonly reason: "missing-price" | "missing-webhook-secret";
  readonly offeringKey?: string;
}> {}

export class PaymentsAccessError extends Data.TaggedError("PaymentsAccessError")<{
  readonly reason:
    | "active-lifetime-entitlement"
    | "active-subscription"
    | "customer-not-found"
    | "missing-user";
}> {}

export type PaymentsError =
  | PaymentsConfigError
  | PaymentsStorageError
  | PaymentsStripeError
  | PaymentsWebhookVerificationError
  | PaymentsSetupError
  | PaymentsAccessError;
