import { Data } from "effect";

export type CacheStorageOperation = "get" | "set" | "delete";
export type CacheSerializationOperation = "serialize" | "deserialize";
export type CacheOperation = CacheStorageOperation | CacheSerializationOperation | "getOrSet";

export class CacheStorageError extends Data.TaggedError("CacheStorageError")<{
  readonly operation: CacheStorageOperation;
  readonly key: string | undefined;
  readonly cause: unknown;
}> {}

export class CacheSerializationError extends Data.TaggedError("CacheSerializationError")<{
  readonly operation: CacheSerializationOperation;
  readonly key: string;
  readonly cause: unknown;
}> {}

export class CacheTtlError extends Data.TaggedError("CacheTtlError")<{
  readonly key: string;
  readonly ttlSeconds: number;
  readonly minimumTtlSeconds: number;
}> {}

export type CacheError = CacheStorageError | CacheSerializationError | CacheTtlError;
