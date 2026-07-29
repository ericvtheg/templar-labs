import type { z } from "zod";

export type WebSearchMode =
  | "auto"
  | "instant"
  | "keyword"
  | "neural"
  | "hybrid"
  | "magic"
  | "fast"
  | "deep-lite"
  | "deep"
  | "deep-reasoning"
  | (string & {});

export type WebTextOptions =
  | boolean
  | {
      readonly maxCharacters?: number;
      readonly includeHtmlTags?: boolean;
    };

export type WebHighlightsOptions =
  | boolean
  | {
      readonly query?: string;
      readonly maxCharacters?: number;
    };

export type WebContentOptions = {
  readonly text?: WebTextOptions;
  readonly highlights?: WebHighlightsOptions;
  readonly summary?: boolean | { readonly query?: string };
  readonly livecrawl?: "never" | "fallback" | "always" | "preferred";
  readonly livecrawlTimeoutMs?: number;
  readonly maxAgeHours?: number;
};

export type WebSearchInput<S extends z.ZodType | undefined = undefined> = {
  readonly query: string;
  readonly numResults?: number;
  readonly includeDomains?: ReadonlyArray<string>;
  readonly excludeDomains?: ReadonlyArray<string>;
  readonly startPublishedDate?: string;
  readonly endPublishedDate?: string;
  readonly userLocation?: string;
  readonly mode?: WebSearchMode;
  readonly contents?: WebContentOptions;
  readonly schema?: S;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
};

export type GetWebContentsInput = {
  readonly urls: ReadonlyArray<string>;
  readonly contents?: WebContentOptions;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
};

export type WebSearchSource = {
  readonly url: string;
  readonly title?: string;
  readonly author?: string;
  readonly publishedDate?: string;
  readonly text?: string;
  readonly highlights?: ReadonlyArray<string>;
  readonly summary?: string;
  readonly raw?: unknown;
};

export type WebGroundingCitation = {
  readonly url: string;
  readonly title?: string;
};

export type WebGrounding = {
  readonly field?: string;
  readonly citations: ReadonlyArray<WebGroundingCitation>;
};

export type OutputFor<S extends z.ZodType | undefined> = S extends z.ZodType
  ? z.output<S>
  : unknown;

export type WebSearchResult<A = unknown> = {
  readonly results: ReadonlyArray<WebSearchSource>;
  readonly output?: A;
  readonly grounding: ReadonlyArray<WebGrounding>;
  readonly requestId?: string;
  readonly costUsd?: number;
  readonly raw: unknown;
};

export type GetWebContentsResult = {
  readonly results: ReadonlyArray<WebSearchSource>;
  readonly requestId?: string;
  readonly costUsd?: number;
  readonly raw: unknown;
};

export type WebSearchJsonSchema = Readonly<Record<string, unknown>>;

export type ResolvedWebSearchInput = Omit<WebSearchInput<undefined>, "schema"> & {
  readonly outputSchema?: WebSearchJsonSchema;
};
