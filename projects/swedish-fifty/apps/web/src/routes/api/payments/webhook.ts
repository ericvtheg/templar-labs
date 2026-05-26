import { createFileRoute } from "@tanstack/react-router";
import { createPaymentsWebhookHandler } from "@templar/payments/tanstack-start";
import { getPayments } from "../../../lib/payments.server.ts";

export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: createPaymentsWebhookHandler({
        payments: getPayments,
      }),
    },
  },
});
