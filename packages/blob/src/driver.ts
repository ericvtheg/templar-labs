import { Effect, type Option } from "effect";
import { type BlobOperation, BlobStorageError } from "./errors";
import type {
  BlobObject,
  BlobObjectBody,
  ListBlobsInput,
  ListBlobsResult,
  PutBlobInput,
} from "./types";

export type BlobStorageDriver = {
  readonly put: (input: PutBlobInput) => Effect.Effect<BlobObject, BlobStorageError>;
  readonly get: (key: string) => Effect.Effect<Option.Option<BlobObjectBody>, BlobStorageError>;
  readonly head: (key: string) => Effect.Effect<Option.Option<BlobObject>, BlobStorageError>;
  readonly delete: (key: string) => Effect.Effect<void, BlobStorageError>;
  readonly list: (input?: ListBlobsInput) => Effect.Effect<ListBlobsResult, BlobStorageError>;
};

export function tryBlobStoragePromise<A>(input: {
  readonly operation: BlobOperation;
  readonly key?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, BlobStorageError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new BlobStorageError({
        operation: input.operation,
        key: input.key,
        cause,
      }),
  });
}
