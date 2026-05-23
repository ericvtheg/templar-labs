import { Effect } from "effect";
import type { AnalyticsOperation } from "./errors.ts";

export type AnalyticsLoggingInput = {
  readonly provider: string;
  readonly operation: AnalyticsOperation;
  readonly app: string;
  readonly projectKey: string;
  readonly environment: string;
};

export function withAnalyticsLogging(input: AnalyticsLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("analytics operation completed")),
      Effect.tapError((error) => Effect.logError("analytics operation failed", error)),
      Effect.annotateLogs(analyticsLogAnnotations(input)),
      Effect.withLogSpan(`analytics.${input.operation}`),
    );
}

function analyticsLogAnnotations(input: AnalyticsLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/analytics",
    provider: input.provider,
    operation: input.operation,
    app: input.app,
    projectKey: input.projectKey,
    environment: input.environment,
  };
}
