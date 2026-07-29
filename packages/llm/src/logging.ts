import { Effect } from "effect";
import type { LLMOperation } from "./errors.ts";
import type { LLMUsage } from "./types.ts";

export type LLMLoggingInput = {
  readonly provider: string;
  readonly operation: LLMOperation;
  readonly model?: string;
  readonly usage?: LLMUsage;
  readonly finishReason?: string;
};

export function withLLMLogging(input: LLMLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("llm operation completed")),
      Effect.tapError((error) => Effect.logError("llm operation failed", error)),
      Effect.annotateLogs(llmLogAnnotations(input)),
      Effect.withLogSpan(`llm.${input.operation}`),
    );
}

function llmLogAnnotations(input: LLMLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/llm",
    provider: input.provider,
    operation: input.operation,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.finishReason === undefined ? {} : { finishReason: input.finishReason }),
    ...(input.usage?.inputTokens === undefined ? {} : { inputTokens: input.usage.inputTokens }),
    ...(input.usage?.outputTokens === undefined ? {} : { outputTokens: input.usage.outputTokens }),
    ...(input.usage?.totalTokens === undefined ? {} : { totalTokens: input.usage.totalTokens }),
    ...(input.usage?.costUsd === undefined ? {} : { costUsd: input.usage.costUsd }),
  };
}
