import type { Effect } from "effect";
import type { CacheError } from "./errors.ts";

export type CacheMetadata = Record<string, unknown>;

export type CacheReadOptions = {
  readonly cacheTtlSeconds?: number;
};

export type CacheEntry<A> = {
  readonly key: string;
  readonly value: A;
  readonly metadata: CacheMetadata | undefined;
};

export type CacheSetInput<A> = {
  readonly key: string;
  readonly value: A;
  readonly ttlSeconds?: number;
  readonly metadata?: CacheMetadata;
};

export type CacheGetOrSetInput<A, E = CacheError, R = never> = {
  readonly key: string;
  readonly ttlSeconds: number;
  readonly compute: Effect.Effect<A, E, R>;
  readonly metadata?: CacheMetadata;
  readonly readOptions?: CacheReadOptions;
};

export type CacheStoredEntry = {
  readonly key: string;
  readonly value: string;
  readonly metadata: CacheMetadata | undefined;
};

export type CacheDriverSetInput = {
  readonly key: string;
  readonly value: string;
  readonly ttlSeconds?: number;
  readonly metadata?: CacheMetadata;
};
