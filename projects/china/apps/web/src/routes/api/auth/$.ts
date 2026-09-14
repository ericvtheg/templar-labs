import { createFileRoute } from "@tanstack/react-router";
import { sameOrigin } from "../../../lib/access.ts";
import { type Bindings, getAuth } from "../../../lib/auth.server.ts";

async function handle(request: Request) {
  if (request.method === "POST" && !sameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const { env } = await import("cloudflare:workers");
  const response = await getAuth(request, env as unknown as Bindings).handler(request);
  const location = response.headers.get("location");
  if (new URL(request.url).pathname === "/api/auth/callback" && location !== null) {
    const destination = new URL(location, request.url);
    if (destination.searchParams.get("error") === "auth") {
      const failure = new URL("/auth-error", request.url);
      failure.searchParams.set("reason", destination.searchParams.get("auth_reason") ?? "unknown");
      response.headers.set("location", failure.href);
    }
  }
  response.headers.set("cache-control", "private, no-store");
  return response;
}
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
