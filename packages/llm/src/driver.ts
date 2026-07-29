import type { Effect } from "effect";
import type { LLMProviderError, LLMRateLimitError } from "./errors.ts";
import type { GenerateTurnResult, ResolvedGenerateTurnInput } from "./types.ts";

export type LLMDriver = {
  readonly provider: string;
  readonly generateTurn: (
    input: ResolvedGenerateTurnInput,
  ) => Effect.Effect<GenerateTurnResult, LLMProviderError | LLMRateLimitError>;
};
