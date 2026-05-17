import { Effect } from "effect";

export type DatabaseLoggingInput = {
  readonly provider: string;
  readonly operation: string;
  readonly table?: string;
};

export function withDatabaseLogging(input: DatabaseLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("database operation completed")),
      Effect.tapError((error) => Effect.logError("database operation failed", error)),
      Effect.annotateLogs(databaseLogAnnotations(input)),
      Effect.withLogSpan(`db.${input.operation}`),
    );
}

function databaseLogAnnotations(input: DatabaseLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/db",
    provider: input.provider,
    operation: input.operation,
    ...(input.table === undefined ? {} : { table: input.table }),
  };
}
