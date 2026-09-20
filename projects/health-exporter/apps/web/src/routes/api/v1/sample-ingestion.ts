import { createFileRoute } from "@tanstack/react-router";
import { makeHealthSyncService } from "../../../domain/service.ts";
import { makeHealthSyncHandler, makeSyncStatusHandler } from "../../../http/health-sync.ts";
import { makeD1HealthRepository } from "../../../infrastructure/d1-repository.ts";

export const Route = createFileRoute("/api/v1/sample-ingestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const service = await resolveService();
        return service instanceof Response ? service : makeHealthSyncHandler(service)(request);
      },
      GET: async ({ request }) => {
        const service = await resolveService();
        return service instanceof Response ? service : makeSyncStatusHandler(service)(request);
      },
    },
  },
});

async function resolveService() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly DB: D1Database; readonly HEALTH_EXPORTER_SECRET?: string };
  if (
    bindings.HEALTH_EXPORTER_SECRET === undefined ||
    bindings.HEALTH_EXPORTER_SECRET.length < 32
  ) {
    return new Response(JSON.stringify({ error: "service_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return makeHealthSyncService(
    makeD1HealthRepository(bindings.DB),
    bindings.HEALTH_EXPORTER_SECRET,
  );
}
