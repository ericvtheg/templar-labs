import { Effect } from "effect";
import type { AIOperation } from "./errors.ts";
import type { AIUsage } from "./types.ts";

export type AILoggingInput = {
  readonly provider: string;
  readonly operation: AIOperation;
  readonly model?: string;
  readonly usage?: AIUsage;
  readonly finishReason?: string;
};

export function withAILogging(input: AILoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("ai operation completed")),
      Effect.tapError((error) => Effect.logError("ai operation failed", error)),
      Effect.annotateLogs(aiLogAnnotations(input)),
      Effect.withLogSpan(`ai.${input.operation}`),
    );
}

function aiLogAnnotations(input: AILoggingInput): Record<string, unknown> {
  return {
    package: "@templar/ai",
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
