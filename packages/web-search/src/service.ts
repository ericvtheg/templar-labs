import { Context, Effect, Layer } from "effect";
import { z } from "zod";
import type { WebSearchDriver } from "./driver.ts";
import { type WebSearchError, WebSearchParseError, WebSearchValidationError } from "./errors.ts";
import { withWebSearchLogging } from "./logging.ts";
import type {
  GetWebContentsInput,
  GetWebContentsResult,
  OutputFor,
  ResolvedWebSearchInput,
  WebSearchInput,
  WebSearchResult,
} from "./types.ts";

export type WebSearchService = {
  readonly search: <S extends z.ZodType | undefined = undefined>(
    input: WebSearchInput<S>,
  ) => Effect.Effect<WebSearchResult<OutputFor<S>>, WebSearchError>;
  readonly getContents: (
    input: GetWebContentsInput,
  ) => Effect.Effect<GetWebContentsResult, WebSearchError>;
};

export class WebSearch extends Context.Tag("@templar/web-search/WebSearch")<
  WebSearch,
  WebSearchService
>() {
  static readonly search = Effect.serviceFunctionEffect(this, (service) => service.search);
  static readonly getContents = Effect.serviceFunctionEffect(
    this,
    (service) => service.getContents,
  );
}

export function makeWebSearchLayer(service: WebSearchService): Layer.Layer<WebSearch> {
  return Layer.succeed(WebSearch, service);
}

export function makeWebSearchService(driver: WebSearchDriver): WebSearchService {
  return {
    search: <S extends z.ZodType | undefined = undefined>(input: WebSearchInput<S>) =>
      Effect.flatMap(resolveSearchInput(input), (resolved) =>
        Effect.flatMap(driver.search(resolved), (result) =>
          parseOutput<S>(input.schema as S, result),
        ),
      ).pipe(withWebSearchLogging({ provider: driver.provider, operation: "search" })),
    getContents: (input) =>
      driver
        .getContents(input)
        .pipe(withWebSearchLogging({ provider: driver.provider, operation: "getContents" })),
  };
}

function resolveSearchInput<S extends z.ZodType | undefined>(
  input: WebSearchInput<S>,
): Effect.Effect<ResolvedWebSearchInput, WebSearchValidationError> {
  return Effect.try({
    try: () => {
      const { schema, ...rest } = input;
      return {
        ...rest,
        ...(schema === undefined
          ? {}
          : { outputSchema: z.toJSONSchema(schema) as Record<string, unknown> }),
      };
    },
    catch: (cause) =>
      new WebSearchValidationError({
        operation: "search",
        field: "schema",
        message: "Failed to convert output schema to JSON Schema.",
        cause,
      }),
  });
}

function parseOutput<S extends z.ZodType | undefined>(
  schema: S,
  result: WebSearchResult<unknown>,
): Effect.Effect<WebSearchResult<OutputFor<S>>, WebSearchParseError> {
  if (schema === undefined) {
    return Effect.succeed(result as WebSearchResult<OutputFor<S>>);
  }
  return Effect.try({
    try: () => ({
      ...result,
      output: schema.parse(result.output) as OutputFor<S>,
    }),
    catch: (cause) =>
      new WebSearchParseError({
        operation: "search",
        message: "Failed to parse structured web search output.",
        output: result.output,
        cause,
      }),
  });
}
