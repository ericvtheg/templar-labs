export type { ExaFetch, ExaWebSearchOptions } from "./drivers/exa.ts";
export {
  exaWebSearchLayer,
  makeExaWebSearch,
  makeWebSearch,
  webSearchLayer,
} from "./drivers/exa.ts";
export type { WebSearchError } from "./errors.ts";
export {
  WebSearchMalformedResponseError,
  WebSearchParseError,
  WebSearchProviderError,
  WebSearchRateLimitError,
  WebSearchValidationError,
} from "./errors.ts";
export {
  makeWebSearchLayer,
  makeWebSearchService,
  WebSearch,
  type WebSearchService,
} from "./service.ts";
export type {
  GetWebContentsInput,
  GetWebContentsResult,
  OutputFor,
  WebContentOptions,
  WebGrounding,
  WebGroundingCitation,
  WebHighlightsOptions,
  WebSearchInput,
  WebSearchMode,
  WebSearchResult,
  WebSearchSource,
  WebTextOptions,
} from "./types.ts";
