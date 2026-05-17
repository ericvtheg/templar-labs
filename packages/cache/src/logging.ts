import { Effect } from "effect";
import { type CacheOperation, CacheTtlError } from "./errors.ts";

export type CacheLoggingInput = {
  readonly provider: string;
  readonly operation: CacheOperation;
  readonly key?: string;
};

export function withCacheLogging(input: CacheLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("cache operation completed")),
      Effect.tapError((error) =>
        error instanceof CacheTtlError
          ? Effect.logDebug("cache ttl rejected", error)
          : Effect.logError("cache operation failed", error),
      ),
      Effect.annotateLogs(cacheLogAnnotations(input)),
      Effect.withLogSpan(`cache.${input.operation}`),
    );
}

function cacheLogAnnotations(input: CacheLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/cache",
    provider: input.provider,
    operation: input.operation,
    ...(input.key === undefined ? {} : { key: input.key }),
  };
}
