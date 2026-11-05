import { createFileRoute } from "@tanstack/react-router";
import { sameOrigin } from "../../../lib/access.ts";
import { getAuth, getBindings } from "../../../lib/auth.server.ts";

async function handle(request: Request) {
  if (request.method === "POST" && !sameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const response = await getAuth(request, await getBindings()).handler(request);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
