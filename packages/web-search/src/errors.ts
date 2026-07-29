import { Data } from "effect";

export type WebSearchOperation = "search" | "getContents";

export class WebSearchValidationError extends Data.TaggedError("WebSearchValidationError")<{
  readonly operation: WebSearchOperation;
  readonly field: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WebSearchProviderError extends Data.TaggedError("WebSearchProviderError")<{
  readonly provider: string;
  readonly operation: WebSearchOperation;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WebSearchRateLimitError extends Data.TaggedError("WebSearchRateLimitError")<{
  readonly provider: string;
  readonly operation: WebSearchOperation;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WebSearchParseError extends Data.TaggedError("WebSearchParseError")<{
  readonly operation: "search";
  readonly message: string;
  readonly output: unknown;
  readonly cause?: unknown;
}> {}

export class WebSearchMalformedResponseError extends Data.TaggedError(
  "WebSearchMalformedResponseError",
)<{
  readonly provider: string;
  readonly operation: WebSearchOperation;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type WebSearchError =
  | WebSearchValidationError
  | WebSearchProviderError
  | WebSearchRateLimitError
  | WebSearchParseError
  | WebSearchMalformedResponseError;
