import { type AgentTool, toolResult } from "@templar/agent";
import type { WebSearchService } from "@templar/web-search";
import { Effect } from "effect";
import { z } from "zod";
import { webSearchToolError, webSourcesForModel } from "./web-search.ts";

export const getWebContentsToolSchema = z.object({
  urls: z.array(z.string()),
  text: z.boolean().optional(),
  highlights: z.boolean().optional(),
  summary: z.boolean().optional(),
});

export function makeGetWebContentsTool(service: WebSearchService): AgentTool {
  return {
    name: "get_web_contents",
    description:
      "Fetch clean contents for known URLs when search results do not contain enough detail to verify a material claim.",
    schema: getWebContentsToolSchema,
    execute: (rawInput) => {
      const input = rawInput as z.output<typeof getWebContentsToolSchema>;
      return service
        .getContents({
          urls: input.urls,
          contents: {
            text: input.text ?? true,
            ...(input.highlights === undefined ? {} : { highlights: input.highlights }),
            ...(input.summary === undefined ? {} : { summary: input.summary }),
          },
        })
        .pipe(
          Effect.map((result) =>
            toolResult(
              {
                results: webSourcesForModel(result.results),
                ...(result.requestId === undefined ? {} : { requestId: result.requestId }),
              },
              {
                ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
                raw: result.raw,
              },
            ),
          ),
          Effect.mapError((error) => webSearchToolError("get_web_contents", error)),
        );
    },
  };
}
