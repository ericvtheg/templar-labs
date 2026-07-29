import { Effect } from "effect";
import type { WebSearchDriver } from "../driver.ts";
import {
  WebSearchMalformedResponseError,
  type WebSearchOperation,
  WebSearchProviderError,
  WebSearchRateLimitError,
} from "../errors.ts";
import { makeWebSearchLayer, makeWebSearchService, type WebSearchService } from "../service.ts";
import type {
  GetWebContentsInput,
  GetWebContentsResult,
  ResolvedWebSearchInput,
  WebContentOptions,
  WebGrounding,
  WebSearchResult,
  WebSearchSource,
} from "../types.ts";

export type ExaFetch = typeof fetch;

export type ExaWebSearchOptions = {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly fetch?: ExaFetch;
};

type ExaResponse = {
  readonly results?: unknown;
  readonly output?: { readonly content?: unknown; readonly grounding?: unknown };
  readonly requestId?: unknown;
  readonly costDollars?: { readonly total?: unknown };
};

export function makeExaWebSearch(options: ExaWebSearchOptions): WebSearchService {
  return makeWebSearchService(createExaDriver(options));
}

export function exaWebSearchLayer(options: ExaWebSearchOptions) {
  return makeWebSearchLayer(makeExaWebSearch(options));
}

export const makeWebSearch = makeExaWebSearch;
export const webSearchLayer = exaWebSearchLayer;

function createExaDriver(options: ExaWebSearchOptions): WebSearchDriver {
  return {
    provider: "exa",
    search: (input) => requestExa(options, "search", searchBody(input), normalizeSearchResponse),
    getContents: (input) =>
      requestExa(options, "getContents", contentsBody(input), normalizeContentsResponse),
  };
}

function requestExa<A>(
  options: ExaWebSearchOptions,
  operation: WebSearchOperation,
  body: Record<string, unknown>,
  normalize: (raw: unknown) => A,
): Effect.Effect<
  A,
  WebSearchProviderError | WebSearchRateLimitError | WebSearchMalformedResponseError
> {
  return Effect.tryPromise({
    try: async (signal) => {
      const fetchImpl = options.fetch ?? fetch;
      const endpoint = operation === "search" ? "search" : "contents";
      const response = await fetchImpl(`${options.baseUrl ?? "https://api.exa.ai"}/${endpoint}`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          ...options.defaultHeaders,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await exaHttpError(operation, response);
      }
      const raw: unknown = await response.json();
      try {
        return normalize(raw);
      } catch (cause) {
        throw cause instanceof WebSearchMalformedResponseError
          ? cause
          : new WebSearchMalformedResponseError({
              provider: "exa",
              operation,
              message: "Exa returned a malformed response.",
              cause,
            });
      }
    },
    catch: (cause) =>
      cause instanceof WebSearchProviderError ||
      cause instanceof WebSearchRateLimitError ||
      cause instanceof WebSearchMalformedResponseError
        ? cause
        : new WebSearchProviderError({
            provider: "exa",
            operation,
            message: "Exa request failed.",
            cause,
          }),
  });
}

function searchBody(input: ResolvedWebSearchInput): Record<string, unknown> {
  return {
    ...input.providerOptions,
    query: input.query,
    ...(input.numResults === undefined ? {} : { numResults: input.numResults }),
    ...(input.includeDomains === undefined ? {} : { includeDomains: input.includeDomains }),
    ...(input.excludeDomains === undefined ? {} : { excludeDomains: input.excludeDomains }),
    ...(input.startPublishedDate === undefined
      ? {}
      : { startPublishedDate: input.startPublishedDate }),
    ...(input.endPublishedDate === undefined ? {} : { endPublishedDate: input.endPublishedDate }),
    ...(input.userLocation === undefined ? {} : { userLocation: input.userLocation }),
    ...(input.mode === undefined ? {} : { type: input.mode }),
    ...(input.contents === undefined ? {} : { contents: exaContentsOptions(input.contents) }),
    ...(input.outputSchema === undefined ? {} : { outputSchema: input.outputSchema }),
  };
}

function contentsBody(input: GetWebContentsInput): Record<string, unknown> {
  return {
    ...input.providerOptions,
    ids: input.urls,
    ...(input.contents === undefined ? {} : exaContentsOptions(input.contents)),
  };
}

function exaContentsOptions(input: WebContentOptions): Record<string, unknown> {
  return {
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.highlights === undefined ? {} : { highlights: input.highlights }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.livecrawl === undefined ? {} : { livecrawl: input.livecrawl }),
    ...(input.livecrawlTimeoutMs === undefined
      ? {}
      : { livecrawlTimeout: input.livecrawlTimeoutMs }),
    ...(input.maxAgeHours === undefined ? {} : { maxAgeHours: input.maxAgeHours }),
  };
}

function normalizeSearchResponse(raw: unknown): WebSearchResult<unknown> {
  const response = responseObject(raw, "search");
  return {
    results: normalizeResults(response.results),
    ...(response.output === undefined ? {} : { output: response.output.content }),
    grounding: normalizeGrounding(response.output?.grounding),
    ...metadata(response),
    raw,
  };
}

function normalizeContentsResponse(raw: unknown): GetWebContentsResult {
  const response = responseObject(raw, "getContents");
  return {
    results: normalizeResults(response.results),
    ...metadata(response),
    raw,
  };
}

function responseObject(raw: unknown, operation: WebSearchOperation): ExaResponse {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("results" in raw) ||
    !Array.isArray(raw.results)
  ) {
    throw new WebSearchMalformedResponseError({
      provider: "exa",
      operation,
      message: "Exa response did not include a results array.",
      cause: raw,
    });
  }
  return raw as ExaResponse;
}

function normalizeResults(value: unknown): ReadonlyArray<WebSearchSource> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("url" in item) ||
      typeof item.url !== "string"
    ) {
      throw new Error("Exa result did not include a URL.");
    }
    const record = item as Record<string, unknown> & { readonly highlights?: unknown };
    return {
      url: item.url,
      ...optionalString(item, "title"),
      ...optionalString(item, "author"),
      ...optionalString(item, "publishedDate"),
      ...optionalString(item, "text"),
      ...optionalString(item, "summary"),
      ...(Array.isArray(record.highlights) &&
      record.highlights.every((entry: unknown) => typeof entry === "string")
        ? { highlights: record.highlights }
        : {}),
      raw: item,
    };
  });
}

function optionalString(object: object, key: string): Record<string, string> {
  const value = (object as Record<string, unknown>)[key];
  return typeof value === "string" ? { [key]: value } : {};
}

function normalizeGrounding(value: unknown): ReadonlyArray<WebGrounding> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const record = entry as Record<string, unknown> & {
      readonly citations?: unknown;
      readonly field?: unknown;
    };
    const citations = Array.isArray(record.citations)
      ? record.citations.flatMap((citation: unknown) => {
          if (typeof citation !== "object" || citation === null) {
            return [];
          }
          const item = citation as Record<string, unknown> & {
            readonly title?: unknown;
            readonly url?: unknown;
          };
          return typeof item.url === "string"
            ? [
                {
                  url: item.url,
                  ...(typeof item.title === "string" ? { title: item.title } : {}),
                },
              ]
            : [];
        })
      : [];
    return [
      {
        ...(typeof record.field === "string" ? { field: record.field } : {}),
        citations,
      },
    ];
  });
}

function metadata(response: ExaResponse): {
  readonly requestId?: string;
  readonly costUsd?: number;
} {
  return {
    ...(typeof response.requestId === "string" ? { requestId: response.requestId } : {}),
    ...(typeof response.costDollars?.total === "number"
      ? { costUsd: response.costDollars.total }
      : {}),
  };
}

async function exaHttpError(
  operation: WebSearchOperation,
  response: Response,
): Promise<WebSearchProviderError | WebSearchRateLimitError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const message = errorMessage(body) ?? `Exa returned HTTP ${response.status}.`;
  const details = {
    provider: "exa",
    operation,
    status: response.status,
    ...(requestId === undefined ? {} : { requestId }),
    message,
    cause: body,
  };
  return response.status === 429
    ? new WebSearchRateLimitError(details)
    : new WebSearchProviderError(details);
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown> & {
    readonly error?: unknown;
    readonly message?: unknown;
  };
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.error === "string") {
    return record.error;
  }
  if (typeof record.error === "object" && record.error !== null) {
    const nested = record.error as Record<string, unknown> & { readonly message?: unknown };
    return typeof nested.message === "string" ? nested.message : undefined;
  }
  return undefined;
}
