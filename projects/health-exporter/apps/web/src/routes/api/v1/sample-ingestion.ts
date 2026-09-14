import { createFileRoute } from "@tanstack/react-router";
import { makeIngestionService } from "../../../domain/service.ts";
import { makeSampleIngestionHandler } from "../../../http/sample-ingestion.ts";
import { makeD1IngestionRepository } from "../../../infrastructure/d1-repository.ts";

export const Route = createFileRoute("/api/v1/sample-ingestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = await import("cloudflare:workers");
        const bindings = env as { readonly DB: D1Database };
        return makeSampleIngestionHandler(
          makeIngestionService(makeD1IngestionRepository(bindings.DB)),
        )(request);
      },
    },
  },
});
