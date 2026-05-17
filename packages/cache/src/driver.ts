import { Effect, type Option } from "effect";
import { CacheStorageError, type CacheStorageOperation } from "./errors.ts";
import type { CacheDriverSetInput, CacheReadOptions, CacheStoredEntry } from "./types.ts";

export type CacheDriver = {
  readonly get: (
    key: string,
    options?: CacheReadOptions,
  ) => Effect.Effect<Option.Option<CacheStoredEntry>, CacheStorageError>;
  readonly set: (input: CacheDriverSetInput) => Effect.Effect<void, CacheStorageError>;
  readonly delete: (key: string) => Effect.Effect<void, CacheStorageError>;
};

export function tryCacheStoragePromise<A>(input: {
  readonly operation: CacheStorageOperation;
  readonly key?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, CacheStorageError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new CacheStorageError({
        operation: input.operation,
        key: input.key,
        cause,
      }),
  });
}
