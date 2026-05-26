import { createFileRoute } from "@tanstack/react-router";
import { createPaymentsCheckoutHandler } from "@templar/payments/tanstack-start";
import { getPayments, getPaymentsUser } from "../../../lib/payments.server.ts";

export const Route = createFileRoute("/api/payments/checkout")({
  server: {
    handlers: {
      GET: createPaymentsCheckoutHandler({
        payments: getPayments,
        user: getPaymentsUser,
        successUrl: (request) => new URL("/", request.url).toString(),
        cancelUrl: (request) => new URL("/", request.url).toString(),
      }),
      POST: createPaymentsCheckoutHandler({
        payments: getPayments,
        user: getPaymentsUser,
        successUrl: (request) => new URL("/", request.url).toString(),
        cancelUrl: (request) => new URL("/", request.url).toString(),
      }),
    },
  },
});
