# @templar/cache

Shared cache conventions for Templar Labs projects.

The package should be named `@templar/cache`, not `@templar/kv`.

`cache` names the capability app code wants: short-lived, best-effort data that
can be recomputed. `kv` names one provider. Keeping the public package named
after the capability leaves room for a memory driver in tests, Cloudflare KV in
Workers, and another backing store later without renaming consumers. Use `kv`
only in provider-specific implementation files.

## Scope

This package should provide a small Effect service over a primitive key-value
cache driver:

- typed cache keys and values at the call site.
- common TTL, namespace, and serialization conventions.
- consistent `Option` handling for cache misses.
- typed errors and logging around provider failures.
- Cloudflare KV wiring from a Worker binding.

It should not become a general database abstraction. Cache entries should be
safe to expire, miss, or briefly serve stale values.

## Cloudflare KV Fit

Cloudflare Workers KV is a good default backing store for read-heavy cache data:

- globally available from Worker bindings.
- low-latency reads after data is cached near the request location.
- native key expiration through `expirationTtl`.
- optional metadata on entries.
- useful for API response caches, feature/config snapshots, rate-limited
  upstream responses, and expensive derived data.

KV is not a good fit when the app needs strict read-after-write consistency,
atomic compare-and-set, high-frequency writes to the same key, counters, locks,
queues, or canonical session state. KV is eventually consistent, and recently
updated keys can still return stale values from another location for the read
cache duration. Cloudflare also limits writes to the same key to one per second.

## Proposed Package Shape

```txt
packages/cache/
  src/
    index.ts
    service.ts
    driver.ts
    types.ts
    errors.ts
    logging.ts
    drivers/
      kv.ts
```

Public exports:

```ts
// @templar/cache
export {
  Cache,
  type CacheService,
  makeCache,
  makeCacheLayer,
  makeCacheService,
} from "./service.ts";
export * from "./types.ts";
export * from "./errors.ts";
```

The shape should mirror `@templar/blob`: providers implement only the primitive
driver contract, while `service.ts` owns derived helpers, logging, errors, and
package-level semantics.

## Service API

Start with a deliberately small API:

```ts
export type CacheService = {
  readonly get: <A = unknown>(
    key: string,
    options?: CacheReadOptions,
  ) => Effect.Effect<Option.Option<CacheEntry<A>>, CacheStorageError>;

  readonly getOrSet: <A>(
    input: CacheGetOrSetInput<A>,
  ) => Effect.Effect<A, CacheError>;

  readonly set: <A>(
    input: CacheSetInput<A>,
  ) => Effect.Effect<void, CacheStorageError>;

  readonly delete: (key: string) => Effect.Effect<void, CacheStorageError>;
};
```

Recommended initial operations:

- `get`: returns `Option.none()` on miss.
- `set`: writes serialized values with optional TTL and metadata.
- `delete`: invalidates one key.
- `getOrSet`: reads first, computes on miss, stores with TTL, and returns the
  value.

Defer broad `list`, `bulkGet`, `touch`, and tag-based invalidation until a real
project needs them. KV supports listing, but exposing list early can encourage
cache-as-database usage.

## Types

Cache values should be JSON by default:

```ts
export type CacheSetInput<A> = {
  readonly key: string;
  readonly value: A;
  readonly ttlSeconds?: number;
  readonly metadata?: CacheMetadata;
};

export type CacheReadOptions = {
  readonly cacheTtlSeconds?: number;
};

export type CacheEntry<A> = {
  readonly key: string;
  readonly value: A;
  readonly metadata: CacheMetadata;
};

export type CacheGetOrSetInput<A> = {
  readonly key: string;
  readonly ttlSeconds: number;
  readonly compute: Effect.Effect<A, CacheError>;
};
```

Keep binary or stream values out of the first pass. If a project needs binary
payloads, route them through `@templar/blob` and cache metadata or lookup keys
in `@templar/cache`.

## Cloudflare KV Driver

The driver should accept a KV-like binding instead of importing app-generated
binding types:

```ts
export type KvNamespaceLike = {
  readonly get: <A = unknown>(
    key: string,
    options?: { type?: "json"; cacheTtl?: number },
  ) => Promise<A | null>;
  readonly put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
};
```

This keeps the package usable in tests and avoids coupling it to one app's
generated Worker environment type. The implementation should still include
`@cloudflare/workers-types` as a dev dependency if needed for type checks.

Example app usage:

```ts
import { makeCache } from "@templar/cache";
import { Effect } from "effect";

const cache = makeCache(env.CACHE);

const program = cache.getOrSet({
  key: "github:user:octocat",
  ttlSeconds: 300,
  compute: fetchGithubUser("octocat"),
});

await Effect.runPromise(program);
```

## Key Conventions

Keys should be explicit and boring:

```txt
<domain>:<entity>:<identifier>[:<version>]
```

Examples:

- `github:user:octocat:v1`
- `pricing:plans:v3`
- `cms:page:/about:v2`

Avoid burying dynamic JSON blobs in keys. Prefer stable helper functions per
domain when keys become shared across files.

## TTL Defaults

Require callers to choose a TTL for `getOrSet`. For direct `set`, allow a
package default only if it is explicitly configured when constructing the layer.

Reasonable starting policy:

- no implicit infinite entries from high-level helpers.
- `ttlSeconds` must be at least 60 when writing through KV, because KV
  `expirationTtl` has a 60-second minimum.
- read `cacheTtlSeconds` defaults to Cloudflare behavior unless the caller
  overrides it; Cloudflare currently allows a minimum read cache TTL of 30
  seconds.

## Deployment

Add a generic KV namespace helper beside the existing D1 and R2 helpers:

```txt
packages/deploy/src/cloudflare/resources/kv-namespace.ts
```

The helper should mirror `d1Database` and `r2Bucket`:

```ts
import type { KVNamespaceProps } from "alchemy/cloudflare";
import { KVNamespace } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type KvNamespaceOptions = Omit<KVNamespaceProps, "title"> &
  Omit<ResourceNameInput, "resource"> & {
    title?: string;
  };

export async function kvNamespace(id: string, options: KvNamespaceOptions) {
  const { project, qualifier, title, ...props } = options;

  return await KVNamespace(id, {
    ...props,
    title: title ?? resourceName({ project, qualifier, resource: id }),
  });
}
```

Project Alchemy files can then bind the namespace:

```ts
const cache = await kvNamespace("cache", { project: "hello-world" });

await tanstackStartApp("web", {
  project: "hello-world",
  bindings: {
    CACHE: cache,
  },
});
```

## Implementation Order

1. Rename the current stub implementation into a real package surface:
   `type: "module"`, exports for `.` and `./kv`, and dependencies on
   `effect` and `@templar/tsconfig`.
2. Add `types.ts`, `errors.ts`, `driver.ts`, `service.ts`, and `logging.ts`
   following the `@templar/blob` pattern.
3. Add `drivers/kv.ts` using the KV binding API.
4. Add focused tests for miss, hit, JSON serialization failure, `getOrSet`,
   delete, TTL validation, and provider error mapping.
5. Add `kvNamespace` to `@templar/deploy/cloudflare`.
6. Wire one project to prove the package from Alchemy binding through runtime
   usage.

## References

- Cloudflare KV overview: https://developers.cloudflare.com/kv/
- Cloudflare KV read API: https://developers.cloudflare.com/kv/api/read-key-value-pairs/
- Cloudflare KV write API: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
- Cloudflare KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Alchemy KV namespace resource:
  https://alchemy.run/providers/cloudflare/kv-namespace/
