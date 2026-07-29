import { type AgentTool, AgentToolError, toolResult } from "@templar/agent";
import type { WebSearchMode, WebSearchService, WebSearchSource } from "@templar/web-search";
import { WebSearchProviderError, WebSearchRateLimitError } from "@templar/web-search";
import { Effect } from "effect";
import { z } from "zod";

export const webSearchToolSchema = z.object({
  query: z.string().describe("Focused web search query."),
  numResults: z.number().optional().describe("Requested number of search results."),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Domains to include, such as manufacturer.com or retailer.se."),
  excludeDomains: z.array(z.string()).optional().describe("Domains to exclude from results."),
  startPublishedDateIso8601: z
    .string()
    .optional()
    .describe(
      "Earliest publication timestamp in ISO 8601 format, such as 2026-07-01T00:00:00Z. Do not use natural-language or partial dates.",
    ),
  endPublishedDateIso8601: z
    .string()
    .optional()
    .describe(
      "Latest publication timestamp in ISO 8601 format, such as 2026-07-31T23:59:59Z. Do not use natural-language or partial dates.",
    ),
  userLocationIsoCountryCode: z
    .string()
    .optional()
    .describe(
      "Two-letter ISO 3166-1 alpha-2 country code used to localize results, such as SE or US.",
    ),
  mode: z
    .string()
    .optional()
    .describe(
      "Exa search mode. Supported modes include auto, instant, keyword, neural, hybrid, fast, deep-lite, deep, deep-reasoning, and magic. Prefer auto unless a specific mode is useful.",
    ),
  contents: z
    .object({
      text: z.boolean().optional(),
      highlights: z.boolean().optional(),
      summary: z.boolean().optional(),
      livecrawl: z
        .string()
        .optional()
        .describe("Live crawl behavior: never, fallback, always, or preferred."),
    })
    .optional(),
});

export function makeWebSearchTool(service: WebSearchService): AgentTool {
  return {
    name: "web_search",
    description:
      "Search the live web. Use focused queries and request text or highlights when snippets are needed for comparison or verification.",
    schema: webSearchToolSchema,
    execute: (rawInput) => {
      const input = rawInput as z.output<typeof webSearchToolSchema>;
      return service
        .search({
          query: input.query,
          ...(input.numResults === undefined ? {} : { numResults: input.numResults }),
          ...(input.includeDomains === undefined ? {} : { includeDomains: input.includeDomains }),
          ...(input.excludeDomains === undefined ? {} : { excludeDomains: input.excludeDomains }),
          ...(input.startPublishedDateIso8601 === undefined
            ? {}
            : { startPublishedDate: input.startPublishedDateIso8601 }),
          ...(input.endPublishedDateIso8601 === undefined
            ? {}
            : { endPublishedDate: input.endPublishedDateIso8601 }),
          ...(input.userLocationIsoCountryCode === undefined
            ? {}
            : { userLocation: input.userLocationIsoCountryCode }),
          ...(input.mode === undefined ? {} : { mode: input.mode as WebSearchMode }),
          ...(input.contents === undefined
            ? {}
            : {
                contents: {
                  ...(input.contents.text === undefined ? {} : { text: input.contents.text }),
                  ...(input.contents.highlights === undefined
                    ? {}
                    : { highlights: input.contents.highlights }),
                  ...(input.contents.summary === undefined
                    ? {}
                    : { summary: input.contents.summary }),
                  ...(input.contents.livecrawl === undefined
                    ? {}
                    : {
                        livecrawl: input.contents.livecrawl as
                          | "never"
                          | "fallback"
                          | "always"
                          | "preferred",
                      }),
                },
              }),
        })
        .pipe(
          Effect.map((result) =>
            toolResult(
              {
                results: webSourcesForModel(result.results),
                ...(result.output === undefined ? {} : { output: result.output }),
                grounding: result.grounding,
                ...(result.requestId === undefined ? {} : { requestId: result.requestId }),
              },
              {
                ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
                raw: result.raw,
              },
            ),
          ),
          Effect.mapError((error) => webSearchToolError("web_search", error)),
        );
    },
  };
}

export function webSourcesForModel(
  sources: ReadonlyArray<WebSearchSource>,
): ReadonlyArray<Omit<WebSearchSource, "raw">> {
  return sources.map(sourceForModel);
}

function sourceForModel(source: WebSearchSource): Omit<WebSearchSource, "raw"> {
  const { raw: _raw, ...visible } = source;
  return visible;
}

export function webSearchToolError(tool: string, error: unknown): AgentToolError {
  const authenticationFailure =
    error instanceof WebSearchProviderError && (error.status === 401 || error.status === 403);
  const transientProviderFailure =
    error instanceof WebSearchProviderError &&
    (error.status === undefined || error.status === 408 || error.status >= 500);
  return new AgentToolError({
    tool,
    code:
      error instanceof WebSearchRateLimitError
        ? "rate_limited"
        : error instanceof WebSearchProviderError
          ? "provider_error"
          : "search_error",
    message: error instanceof Error ? error.message : "Web search failed.",
    recoverable: !authenticationFailure,
    ...(error instanceof WebSearchRateLimitError || transientProviderFailure
      ? { retryable: true }
      : {}),
    cause: error,
  });
}
