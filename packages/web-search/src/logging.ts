import { Effect } from "effect";
import type { WebSearchOperation } from "./errors.ts";

export type WebSearchLoggingInput = {
  readonly provider: string;
  readonly operation: WebSearchOperation;
};

export function withWebSearchLogging(input: WebSearchLoggingInput) {
  return <A extends { readonly requestId?: string; readonly costUsd?: number }, E, R>(
    self: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap((result) =>
        Effect.logDebug("web search operation completed").pipe(
          Effect.annotateLogs({
            ...annotations(input),
            ...(result.requestId === undefined ? {} : { requestId: result.requestId }),
            ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
          }),
        ),
      ),
      Effect.tapError((error) => Effect.logError("web search operation failed", error)),
      Effect.annotateLogs(annotations(input)),
      Effect.withLogSpan(`webSearch.${input.operation}`),
    );
}

function annotations(input: WebSearchLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/web-search",
    provider: input.provider,
    operation: input.operation,
  };
}
