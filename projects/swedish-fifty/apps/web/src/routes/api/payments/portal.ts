import { createFileRoute } from "@tanstack/react-router";
import { createPaymentsPortalHandler } from "@templar/payments/tanstack-start";
import { getPayments, getPaymentsUser } from "../../../lib/payments.server.ts";

export const Route = createFileRoute("/api/payments/portal")({
  server: {
    handlers: {
      GET: createPaymentsPortalHandler({
        payments: getPayments,
        user: getPaymentsUser,
        returnUrl: (request) => new URL("/", request.url).toString(),
      }),
      POST: createPaymentsPortalHandler({
        payments: getPayments,
        user: getPaymentsUser,
        returnUrl: (request) => new URL("/", request.url).toString(),
      }),
    },
  },
});
