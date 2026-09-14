import { createFileRoute } from "@tanstack/react-router";
import type { Bindings } from "../../../lib/auth.server.ts";
import { handleTrip, json } from "../../../lib/trip.server.ts";

async function handle(request: Request) {
  try {
    const { env } = await import("cloudflare:workers");
    return await handleTrip(request, env as unknown as Bindings);
  } catch (error) {
    console.error(
      "China request failed",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return json({ error: "Couldn’t reach the crew clubhouse. Try again in a moment." }, 500);
  }
}
export const Route = createFileRoute("/api/trip/$")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
