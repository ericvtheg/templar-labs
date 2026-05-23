import type { Effect } from "effect";
import type { AnalyticsProviderError } from "./errors.ts";
import type { ResolvedIdentifyUserInput, ResolvedTrackEventInput } from "./types.ts";

export type AnalyticsDriver = {
  readonly provider: string;
  readonly track: (input: ResolvedTrackEventInput) => Effect.Effect<void, AnalyticsProviderError>;
  readonly identify: (
    input: ResolvedIdentifyUserInput,
  ) => Effect.Effect<void, AnalyticsProviderError>;
};
