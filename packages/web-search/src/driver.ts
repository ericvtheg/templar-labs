import type { Effect } from "effect";
import type {
  WebSearchMalformedResponseError,
  WebSearchProviderError,
  WebSearchRateLimitError,
} from "./errors.ts";
import type {
  GetWebContentsInput,
  GetWebContentsResult,
  ResolvedWebSearchInput,
  WebSearchResult,
} from "./types.ts";

export type WebSearchDriverError =
  | WebSearchProviderError
  | WebSearchRateLimitError
  | WebSearchMalformedResponseError;

export type WebSearchDriver = {
  readonly provider: string;
  readonly search: (
    input: ResolvedWebSearchInput,
  ) => Effect.Effect<WebSearchResult<unknown>, WebSearchDriverError>;
  readonly getContents: (
    input: GetWebContentsInput,
  ) => Effect.Effect<GetWebContentsResult, WebSearchDriverError>;
};
