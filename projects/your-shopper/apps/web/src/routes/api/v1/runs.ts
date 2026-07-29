import { createFileRoute } from "@tanstack/react-router";
import { withApiKey } from "@templar/api-auth/tanstack-start";
import { getApiAuth } from "../../../lib/api-auth.server.ts";
import {
  type CreateShoppingRunInput,
  createShoppingRun,
  parseCreateShoppingRunInput,
  ShoppingApiInputError,
  shoppingRunResponse,
} from "../../../lib/shopper-api.ts";

export const Route = createFileRoute("/api/v1/runs")({
  server: {
    handlers: {
      POST: withApiKey(
        {
          apiAuth: getApiAuth,
          permissions: { runs: ["create"] },
        },
        async ({ request }) => {
          let input: CreateShoppingRunInput;
          try {
            input = parseCreateShoppingRunInput(await request.json());
          } catch (error) {
            return errorResponse(
              error instanceof ShoppingApiInputError ? error.code : "invalid-json",
              error instanceof ShoppingApiInputError
                ? error.message
                : "The request body must be valid JSON.",
              400,
            );
          }

          try {
            const result = shoppingRunResponse(
              await createShoppingRun(input, new URL(request.url).origin),
            );
            return Response.json(result.body, { status: result.status });
          } catch {
            return errorResponse(
              "run-unavailable",
              "Shopping research is temporarily unavailable.",
              503,
            );
          }
        },
      ),
    },
  },
});

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}
