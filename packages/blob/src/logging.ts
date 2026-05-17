import { Effect } from "effect";
import { BlobNotFoundError, type BlobOperation } from "./errors";

export type BlobLoggingInput = {
  readonly provider: string;
  readonly operation: BlobOperation;
  readonly key?: string;
};

export function withBlobLogging(input: BlobLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("blob operation completed")),
      Effect.tapError((error) =>
        error instanceof BlobNotFoundError
          ? Effect.logDebug("blob not found", error)
          : Effect.logError("blob operation failed", error),
      ),
      Effect.annotateLogs(blobLogAnnotations(input)),
      Effect.withLogSpan(`blob.${input.operation}`),
    );
}

function blobLogAnnotations(input: BlobLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/blob",
    provider: input.provider,
    operation: input.operation,
    ...(input.key === undefined ? {} : { key: input.key }),
  };
}
