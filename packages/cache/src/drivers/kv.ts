import { Option } from "effect";
import { type CacheDriver, tryCacheStoragePromise } from "../driver.ts";
import { type CacheService, makeCacheLayer, makeCacheService } from "../service.ts";
import type {
  CacheDriverSetInput,
  CacheMetadata,
  CacheReadOptions,
  CacheStoredEntry,
} from "../types.ts";

export type KvValueWithMetadata = {
  readonly value: string | null;
  readonly metadata: CacheMetadata | null;
};

export type KvGetOptions = {
  readonly type: "text";
  readonly cacheTtl?: number;
};

export type KvPutOptions = {
  readonly expirationTtl?: number;
  readonly metadata?: CacheMetadata;
};

export type KvNamespaceLike = {
  readonly getWithMetadata: (key: string, options: KvGetOptions) => Promise<KvValueWithMetadata>;
  readonly put: (key: string, value: string, options?: KvPutOptions) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
};

export function makeKvCache(namespace: KvNamespaceLike): CacheService {
  const driver = {
    get: (key: string, options?: CacheReadOptions) =>
      tryCacheStoragePromise({
        operation: "get",
        key,
        try: async () => {
          const result = await namespace.getWithMetadata(key, kvGetOptions(options));

          return Option.fromNullable(result.value).pipe(
            Option.map(
              (value): CacheStoredEntry => ({
                key,
                value,
                metadata: result.metadata ?? undefined,
              }),
            ),
          );
        },
      }),
    set: (input: CacheDriverSetInput) =>
      tryCacheStoragePromise({
        operation: "set",
        key: input.key,
        try: () => namespace.put(input.key, input.value, kvPutOptions(input)),
      }),
    delete: (key: string) =>
      tryCacheStoragePromise({
        operation: "delete",
        key,
        try: () => namespace.delete(key),
      }),
  } satisfies CacheDriver;

  return makeCacheService({
    provider: "kv",
    driver,
  });
}

export const makeCache = makeKvCache;

export function kvCacheLayer(namespace: KvNamespaceLike) {
  return makeCacheLayer(makeKvCache(namespace));
}

export const cacheLayer = kvCacheLayer;

function kvGetOptions(options: CacheReadOptions | undefined): KvGetOptions {
  return {
    type: "text",
    ...(options?.cacheTtlSeconds === undefined ? {} : { cacheTtl: options.cacheTtlSeconds }),
  };
}

function kvPutOptions(input: CacheDriverSetInput): KvPutOptions | undefined {
  if (input.ttlSeconds === undefined && input.metadata === undefined) {
    return undefined;
  }

  return {
    ...(input.ttlSeconds === undefined ? {} : { expirationTtl: input.ttlSeconds }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}
