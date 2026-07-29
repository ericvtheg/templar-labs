import { createFileRoute } from "@tanstack/react-router";
import { withApiKey } from "@templar/api-auth/tanstack-start";
import { getApiAuth } from "../../../lib/api-auth.server.ts";

export const Route = createFileRoute("/api/v1/hello")({
  server: {
    handlers: {
      GET: withApiKey(
        {
          apiAuth: getApiAuth,
          permissions: { hello: ["read"] },
        },
        () => Response.json({ message: "hello world" }),
      ),
    },
  },
});
