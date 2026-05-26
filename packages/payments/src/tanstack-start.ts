import { Effect } from "effect";
import {
  PaymentsAccessError,
  PaymentsSetupError,
  PaymentsStorageError,
  PaymentsStripeError,
  PaymentsWebhookVerificationError,
} from "./errors.ts";
import type {
  PaymentsService,
  PaymentsUser,
  StartCheckoutInput,
  WebhookProcessingResult,
} from "./service.ts";

export type PaymentsRouteContext = {
  readonly request: Request;
};

export type PaymentsRouteServiceResolver = () => PaymentsService | Promise<PaymentsService>;
export type PaymentsRouteUserResolver = (
  request: Request,
) => PaymentsUser | null | Promise<PaymentsUser | null>;

export type PaymentsCheckoutRouteOptions = {
  readonly payments: PaymentsRouteServiceResolver;
  readonly user: PaymentsRouteUserResolver;
  readonly successUrl?: string | ((request: Request) => string | Promise<string>);
  readonly cancelUrl?: string | ((request: Request) => string | Promise<string>);
};

export type PaymentsPortalRouteOptions = {
  readonly payments: PaymentsRouteServiceResolver;
  readonly user: PaymentsRouteUserResolver;
  readonly returnUrl?: string | ((request: Request) => string | Promise<string>);
};

export type PaymentsWebhookRouteOptions = {
  readonly payments: PaymentsRouteServiceResolver;
};

export function createPaymentsCheckoutHandler(options: PaymentsCheckoutRouteOptions) {
  return async ({ request }: PaymentsRouteContext): Promise<Response> => {
    const user = await options.user(request);

    if (user === null) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await readBody(request);
    const successUrl =
      stringField(body, "successUrl") ?? (await resolveUrlOption(options.successUrl, request));
    const cancelUrl =
      stringField(body, "cancelUrl") ?? (await resolveUrlOption(options.cancelUrl, request));
    const offering = stringField(body, "offering");

    if ((offering !== "subscription" && offering !== "lifetime") || successUrl === null) {
      return json({ error: "invalid-checkout-request" }, 400);
    }

    if (cancelUrl === null) {
      return json({ error: "invalid-checkout-request" }, 400);
    }

    const metadata = metadataField(body);
    const input: StartCheckoutInput = {
      user,
      offering,
      successUrl,
      cancelUrl,
      ...(metadata === undefined ? {} : { metadata }),
    };

    return await runPaymentsEffect(async () => {
      const payments = await options.payments();
      const session = await Effect.runPromise(payments.startCheckout(input));

      return Response.redirect(session.url, 303);
    });
  };
}

export function createPaymentsPortalHandler(options: PaymentsPortalRouteOptions) {
  return async ({ request }: PaymentsRouteContext): Promise<Response> => {
    const user = await options.user(request);

    if (user === null) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await readBody(request);
    const returnUrl =
      stringField(body, "returnUrl") ?? (await resolveUrlOption(options.returnUrl, request));

    if (returnUrl === null) {
      return json({ error: "invalid-portal-request" }, 400);
    }

    return await runPaymentsEffect(async () => {
      const payments = await options.payments();
      const session = await Effect.runPromise(
        payments.createBillingPortalSession({
          userId: user.id,
          returnUrl,
        }),
      );

      return Response.redirect(session.url, 303);
    });
  };
}

export function createPaymentsWebhookHandler(options: PaymentsWebhookRouteOptions) {
  return async ({ request }: PaymentsRouteContext): Promise<Response> => {
    const signature = request.headers.get("stripe-signature");

    if (signature === null) {
      return json({ error: "missing-stripe-signature" }, 400);
    }

    return await runPaymentsEffect(async () => {
      const payments = await options.payments();
      const result = await Effect.runPromise(
        payments.verifyAndHandleWebhook({
          payload: await request.text(),
          signature,
        }),
      );

      return json(webhookResponse(result), 200);
    });
  };
}

async function runPaymentsEffect(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return json({ error: errorCode(error) }, errorStatus(error));
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());

  if (request.method === "GET" || request.method === "HEAD") {
    return query;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as unknown;

    return {
      ...query,
      ...(typeof body === "object" && body !== null ? body : {}),
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const body = Object.fromEntries(await request.formData());

    return {
      ...query,
      ...body,
    };
  }

  return query;
}

async function resolveUrlOption(
  option: string | ((request: Request) => string | Promise<string>) | undefined,
  request: Request,
): Promise<string | null> {
  if (typeof option === "string") {
    return option;
  }

  if (typeof option === "function") {
    return await option(request);
  }

  return null;
}

function stringField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];

  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function metadataField(body: Record<string, unknown>): Record<string, string> | undefined {
  const metadata = Reflect.get(body, "metadata") as unknown;

  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return Object.fromEntries(entries);
}

function webhookResponse(result: WebhookProcessingResult): Record<string, string | null> {
  return {
    eventId: result.eventId,
    eventType: result.eventType,
    objectId: result.objectId,
    objectType: result.objectType,
    status: result.status,
  };
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function errorCode(error: unknown): string {
  if (error instanceof PaymentsWebhookVerificationError) {
    return "invalid-webhook-signature";
  }

  if (error instanceof PaymentsAccessError) {
    return error.reason;
  }

  if (error instanceof PaymentsSetupError) {
    return error.reason;
  }

  if (error instanceof PaymentsStripeError) {
    return "stripe-error";
  }

  if (error instanceof PaymentsStorageError) {
    return "storage-error";
  }

  return "payments-error";
}

function errorStatus(error: unknown): number {
  if (error instanceof PaymentsWebhookVerificationError) {
    return 400;
  }

  if (error instanceof PaymentsAccessError) {
    return error.reason === "customer-not-found" ? 404 : 409;
  }

  if (error instanceof PaymentsSetupError) {
    return 500;
  }

  return 500;
}
