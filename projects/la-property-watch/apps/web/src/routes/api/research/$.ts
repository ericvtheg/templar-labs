import { createFileRoute } from "@tanstack/react-router";
import { getBindings } from "../../../lib/auth.server.ts";
import { handleResearch, json } from "../../../lib/research.server.ts";

async function handle(request: Request) {
  try {
    return await handleResearch(request, await getBindings());
  } catch (cause) {
    console.error(
      "LA Property Watch route failed",
      cause instanceof Error ? cause.message : "Unknown failure",
    );
    return json({ error: "The research service is temporarily unavailable." }, 500);
  }
}

export const Route = createFileRoute("/api/research/$")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
