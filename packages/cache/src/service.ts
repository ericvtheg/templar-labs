import { Context, Effect, Layer, Option } from "effect";
import type { CacheDriver } from "./driver.ts";
import {
  type CacheError,
  CacheSerializationError,
  type CacheStorageError,
  CacheTtlError,
} from "./errors.ts";
import { withCacheLogging } from "./logging.ts";
import type {
  CacheEntry,
  CacheGetOrSetInput,
  CacheReadOptions,
  CacheSetInput,
  CacheStoredEntry,
} from "./types.ts";

const minimumKvExpirationTtlSeconds = 60;

export type CacheService = {
  readonly get: <A = unknown>(
    key: string,
    options?: CacheReadOptions,
  ) => Effect.Effect<Option.Option<CacheEntry<A>>, CacheError>;
  readonly getOrSet: <A, E = CacheError, R = never>(
    input: CacheGetOrSetInput<A, E, R>,
  ) => Effect.Effect<A, CacheError | E, R>;
  readonly set: <A>(input: CacheSetInput<A>) => Effect.Effect<void, CacheError>;
  readonly delete: (key: string) => Effect.Effect<void, CacheStorageError>;
};

export class Cache extends Context.Tag("@templar/cache/Cache")<Cache, CacheService>() {
  static readonly get = Effect.serviceFunctionEffect(this, (cache) => cache.get);
  static readonly getOrSet = Effect.serviceFunctionEffect(this, (cache) => cache.getOrSet);
  static readonly set = Effect.serviceFunctionEffect(this, (cache) => cache.set);
  static readonly delete = Effect.serviceFunctionEffect(this, (cache) => cache.delete);
}

export function makeCacheLayer(service: CacheService): Layer.Layer<Cache> {
  return Layer.succeed(Cache, service);
}

export function makeCacheService(input: {
  readonly provider: string;
  readonly driver: CacheDriver;
  readonly minimumTtlSeconds?: number;
}): CacheService {
  const minimumTtlSeconds = input.minimumTtlSeconds ?? minimumKvExpirationTtlSeconds;
  const service: CacheService = {
    get: makeGet(input.driver.get),
    getOrSet: makeGetOrSet(input.driver.get, input.driver.set, minimumTtlSeconds),
    set: makeSet(input.driver.set, minimumTtlSeconds),
    delete: input.driver.delete,
  };

  return withCacheServiceLogging(input.provider, service);
}

function makeGet(get: CacheDriver["get"]): CacheService["get"] {
  return <A = unknown>(key: string, options?: CacheReadOptions) =>
    Effect.flatMap(get(key, options), (entry) =>
      Option.match(entry, {
        onNone: () => Effect.succeed(Option.none<CacheEntry<A>>()),
        onSome: (storedEntry) =>
          Effect.map(deserializeEntry<A>(storedEntry), (cacheEntry) => Option.some(cacheEntry)),
      }),
    );
}

function makeGetOrSet(
  get: CacheDriver["get"],
  set: CacheDriver["set"],
  minimumTtlSeconds: number,
): CacheService["getOrSet"] {
  const read = makeGet(get);
  const write = makeSet(set, minimumTtlSeconds);

  return <A, E = CacheError, R = never>(input: CacheGetOrSetInput<A, E, R>) =>
    Effect.flatMap(read<A>(input.key, input.readOptions), (entry) =>
      Option.match(entry, {
        onNone: () =>
          Effect.flatMap(input.compute, (value) =>
            Effect.as(write(cacheSetInput(input, value)), value),
          ),
        onSome: (cacheEntry) => Effect.succeed(cacheEntry.value),
      }),
    );
}

function makeSet(set: CacheDriver["set"], minimumTtlSeconds: number): CacheService["set"] {
  return <A>(input: CacheSetInput<A>) =>
    Effect.flatMap(validateTtl(input.key, input.ttlSeconds, minimumTtlSeconds), () =>
      Effect.flatMap(serializeValue(input.key, input.value), (value) =>
        set(cacheDriverSetInput(input, value)),
      ),
    );
}

function cacheSetInput<A, E, R>(input: CacheGetOrSetInput<A, E, R>, value: A): CacheSetInput<A> {
  return {
    key: input.key,
    value,
    ttlSeconds: input.ttlSeconds,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

function cacheDriverSetInput<A>(input: CacheSetInput<A>, value: string) {
  return {
    key: input.key,
    value,
    ...(input.ttlSeconds === undefined ? {} : { ttlSeconds: input.ttlSeconds }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

function serializeValue<A>(key: string, value: A): Effect.Effect<string, CacheSerializationError> {
  return Effect.try({
    try: () => JSON.stringify(value),
    catch: (cause) =>
      new CacheSerializationError({
        operation: "serialize",
        key,
        cause,
      }),
  }).pipe(
    Effect.flatMap((serialized) =>
      serialized === undefined
        ? Effect.fail(
            new CacheSerializationError({
              operation: "serialize",
              key,
              cause: new TypeError("Cache values must be JSON serializable."),
            }),
          )
        : Effect.succeed(serialized),
    ),
  );
}

function deserializeEntry<A>(
  entry: CacheStoredEntry,
): Effect.Effect<CacheEntry<A>, CacheSerializationError> {
  return Effect.try({
    try: (): CacheEntry<A> => ({
      key: entry.key,
      value: JSON.parse(entry.value) as A,
      metadata: entry.metadata,
    }),
    catch: (cause) =>
      new CacheSerializationError({
        operation: "deserialize",
        key: entry.key,
        cause,
      }),
  });
}

function validateTtl(
  key: string,
  ttlSeconds: number | undefined,
  minimumTtlSeconds: number,
): Effect.Effect<void, CacheTtlError> {
  if (ttlSeconds === undefined || ttlSeconds >= minimumTtlSeconds) {
    return Effect.void;
  }

  return Effect.fail(
    new CacheTtlError({
      key,
      ttlSeconds,
      minimumTtlSeconds,
    }),
  );
}

function withCacheServiceLogging(provider: string, service: CacheService): CacheService {
  return {
    get: <A = unknown>(key: string, options?: CacheReadOptions) =>
      service.get<A>(key, options).pipe(
        withCacheLogging({
          provider,
          operation: "get",
          key,
        }),
      ),
    getOrSet: <A, E = CacheError, R = never>(input: CacheGetOrSetInput<A, E, R>) =>
      service.getOrSet(input).pipe(
        withCacheLogging({
          provider,
          operation: "getOrSet",
          key: input.key,
        }),
      ),
    set: <A>(input: CacheSetInput<A>) =>
      service.set(input).pipe(
        withCacheLogging({
          provider,
          operation: "set",
          key: input.key,
        }),
      ),
    delete: (key: string) =>
      service.delete(key).pipe(
        withCacheLogging({
          provider,
          operation: "delete",
          key,
        }),
      ),
  };
}
