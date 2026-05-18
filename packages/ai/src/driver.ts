import type { Effect } from "effect";
import type { AIProviderError, AIRateLimitError } from "./errors.ts";
import type { GenerateTextResult, ResolvedGenerateTextInput } from "./types.ts";

export type AIDriver = {
  readonly provider: string;
  readonly generateText: (
    input: ResolvedGenerateTextInput,
  ) => Effect.Effect<GenerateTextResult, AIProviderError | AIRateLimitError>;
};
