# PostHog Analytics Driver Plan

## Context

`packages/analytics` is currently a stub with only `src/index.ts`. The closest established package patterns are:

- `@templar/blob`: core service/types/errors at the package root, concrete driver at a subpath export like `@templar/blob/r2`.
- `@templar/cache`: `driver.ts`, `service.ts`, `types.ts`, `errors.ts`, `logging.ts`, and a provider driver under `src/drivers`.
- `@templar/db`: small provider service plus `@templar/db/d1` subpath export.

The analytics package should follow the `blob` / `cache` shape because analytics needs operation methods, typed input, provider logging, and provider-specific failure wrapping.

Decisions:

- Do not include feature flags.
- Send events immediately. Do not add an in-memory batch queue in the package.
- Self-host PostHog at `https://analytics.ericventor.com`.
- Deployed apps should hit the homelab PostHog instance directly.
- Use `ssh homelab-lan` for homelab access. Current host probe shows Ubuntu on `eric-lab` with Docker installed.

## Scope

Implement a server/runtime-safe PostHog analytics driver for `@templar/analytics`.

The MVP should support:

- `track`
- `identify`
- `alias`
- `groupIdentify`

The MVP should not support:

- Feature flag evaluation
- Experiments
- Session replay browser SDK setup
- Client-side autocapture
- Buffered background delivery

Those can be added later as separate browser-facing or product-specific integrations.

## Package Shape

Update `packages/analytics` to this structure:

```text
packages/analytics/
  package.json
  src/
    driver.ts
    errors.ts
    index.ts
    logging.ts
    service.ts
    types.ts
    service.test.ts
    drivers/
      posthog.ts
      posthog.test.ts
```

## Core Types

Add `packages/analytics/src/types.ts`.

Suggested types:

```ts
export type AnalyticsProperties = Readonly<Record<string, unknown>>;

export type TrackEventInput = {
  readonly distinctId: string;
  readonly event: string;
  readonly properties?: AnalyticsProperties;
  readonly groups?: Readonly<Record<string, string>>;
  readonly timestamp?: Date | string;
};

export type IdentifyUserInput = {
  readonly distinctId: string;
  readonly properties?: AnalyticsProperties;
  readonly setOnce?: AnalyticsProperties;
  readonly timestamp?: Date | string;
};

export type AliasUserInput = {
  readonly distinctId: string;
  readonly alias: string;
};

export type GroupIdentifyInput = {
  readonly distinctId: string;
  readonly groupType: string;
  readonly groupKey: string;
  readonly properties?: AnalyticsProperties;
  readonly timestamp?: Date | string;
};
```

Keep names generic. PostHog-specific names like `api_key`, `$set`, `$groups`, and `$groupidentify` should stay inside the PostHog driver.

## Errors

Add `packages/analytics/src/errors.ts`.

Pattern after `packages/blob/src/errors.ts` and `packages/cache/src/errors.ts`:

```ts
import { Data } from "effect";

export type AnalyticsOperation = "track" | "identify" | "alias" | "groupIdentify";

export class AnalyticsError extends Data.TaggedError("AnalyticsError")<{
  readonly operation: AnalyticsOperation;
  readonly event: string | undefined;
  readonly distinctId: string | undefined;
  readonly cause: unknown;
}> {}
```

The driver should include response status/body details in `cause` when PostHog returns a non-2xx response.

## Driver Interface

Add `packages/analytics/src/driver.ts`.

Pattern after `tryBlobStoragePromise` and `tryCacheStoragePromise`:

```ts
import { Effect } from "effect";
import { AnalyticsError, type AnalyticsOperation } from "./errors.ts";
import type { AliasUserInput, GroupIdentifyInput, IdentifyUserInput, TrackEventInput } from "./types.ts";

export type AnalyticsDriver = {
  readonly track: (input: TrackEventInput) => Effect.Effect<void, AnalyticsError>;
  readonly identify: (input: IdentifyUserInput) => Effect.Effect<void, AnalyticsError>;
  readonly alias: (input: AliasUserInput) => Effect.Effect<void, AnalyticsError>;
  readonly groupIdentify: (input: GroupIdentifyInput) => Effect.Effect<void, AnalyticsError>;
};

export function tryAnalyticsPromise<A>(input: {
  readonly operation: AnalyticsOperation;
  readonly event?: string;
  readonly distinctId?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, AnalyticsError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new AnalyticsError({
        operation: input.operation,
        event: input.event,
        distinctId: input.distinctId,
        cause,
      }),
  });
}
```

## Service

Add `packages/analytics/src/service.ts`.

Pattern after `BlobStorage` and `Cache`:

- `AnalyticsService` mirrors `AnalyticsDriver`.
- `Analytics extends Context.Tag("@templar/analytics/Analytics")`.
- Static methods use `Effect.serviceFunctionEffect`.
- `makeAnalyticsService({ provider, driver })` wraps the driver with logging.
- `makeAnalyticsLayer(service)` returns `Layer.succeed`.

No extra behavior should be added in the service for MVP. The service exists to standardize DI, logging, and provider independence.

## Logging

Add `packages/analytics/src/logging.ts`.

Pattern after `withBlobLogging` / `withCacheLogging`:

- `Effect.tap(() => Effect.logDebug("analytics operation completed"))`
- `Effect.tapError((error) => Effect.logError("analytics operation failed", error))`
- `Effect.annotateLogs(...)`
- `Effect.withLogSpan(...)`

Suggested annotations:

```ts
{
  package: "@templar/analytics",
  provider,
  operation,
  event,
  distinctId,
}
```

Do not log event properties by default. They may contain user data.

## PostHog Driver

Add `packages/analytics/src/drivers/posthog.ts`.

Use direct HTTP calls with `fetch`, not `posthog-node`, for the MVP. Reasons:

- Immediate sends are required.
- The repo defaults to Cloudflare-oriented runtimes.
- The PostHog capture API is simple enough for the required MVP operations.
- Avoid Node SDK background queue/shutdown behavior.

Exports:

```ts
export type PostHogAnalyticsOptions = {
  readonly apiKey: string;
  readonly host?: string;
  readonly fetch?: typeof fetch;
  readonly defaultProperties?: AnalyticsProperties;
};

export function makePostHogAnalytics(options: PostHogAnalyticsOptions): AnalyticsService;

export function postHogAnalyticsLayer(options: PostHogAnalyticsOptions): Layer.Layer<Analytics>;
```

Default `host` should be:

```ts
"https://analytics.ericventor.com"
```

Request behavior:

- POST JSON to `${host}/i/v0/e/`.
- Set `Content-Type: application/json`.
- Treat any non-2xx response as an `AnalyticsError`.
- Preserve response status and a short response body in the thrown cause.
- Normalize `Date` timestamps to ISO strings.

Payload mappings:

`track`:

```json
{
  "api_key": "<project token>",
  "event": "project created",
  "distinct_id": "user_123",
  "properties": {
    "...defaultProperties": "...",
    "...input.properties": "...",
    "$groups": {
      "organization": "org_123"
    }
  },
  "timestamp": "2026-05-17T00:00:00.000Z"
}
```

`identify`:

```json
{
  "api_key": "<project token>",
  "event": "$identify",
  "distinct_id": "user_123",
  "properties": {
    "$set": {},
    "$set_once": {}
  }
}
```

`alias`:

```json
{
  "api_key": "<project token>",
  "event": "$create_alias",
  "distinct_id": "anonymous_or_old_id",
  "properties": {
    "alias": "user_123"
  }
}
```

`groupIdentify`:

```json
{
  "api_key": "<project token>",
  "event": "$groupidentify",
  "distinct_id": "user_123",
  "properties": {
    "$group_type": "organization",
    "$group_key": "org_123",
    "$group_set": {}
  }
}
```

PostHog's capture docs state that `/i/v0/e/` and `/batch/` are the main event ingestion endpoints, that self-hosted deployments should use the self-hosted domain, and that event capture requires `api_key`, `distinct_id`, and `event`.

Reference: https://posthog.com/docs/api/capture

## Package Exports

Update `packages/analytics/package.json`:

```json
{
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./posthog": "./src/drivers/posthog.ts"
  },
  "dependencies": {
    "@templar/tsconfig": "workspace:*",
    "effect": "^3.21.2"
  },
  "devDependencies": {
    "@types/node": "^24.12.4"
  }
}
```

Keep scripts aligned with sibling packages:

```json
{
  "test": "node --test src/*.test.ts",
  "typecheck": "tsc --noEmit"
}
```

Update `packages/analytics/src/index.ts`:

```ts
export * from "./errors.ts";
export { Analytics, type AnalyticsService, makeAnalyticsLayer, makeAnalyticsService } from "./service.ts";
export * from "./types.ts";
```

## Tests

Add `packages/analytics/src/service.test.ts`:

- `makeAnalyticsService` delegates `track`, `identify`, `alias`, and `groupIdentify`.
- The service returns the same failures the driver returns.
- Provider logging wrapper does not alter results.

Add `packages/analytics/src/drivers/posthog.test.ts`:

- `track` sends one immediate request to `/i/v0/e/`.
- `track` includes default properties and input properties.
- `track` maps groups to `$groups`.
- `identify` maps to `$identify` with `$set` and `$set_once`.
- `alias` maps to `$create_alias`.
- `groupIdentify` maps to `$groupidentify`.
- `Date` timestamps become ISO strings.
- Non-2xx responses fail with `AnalyticsError`.
- Custom `host` and custom `fetch` are respected.

No test should call the real `analytics.ericventor.com` host.

## Homelab Deployment

Use PostHog self-hosted Docker Compose on `homelab-lan`.

Observed:

- Hostname: `eric-lab`
- OS: Ubuntu Linux
- Docker available at `/usr/bin/docker`
- `~/homelab` symlinks to `/opt/homelab`

Recommended deployment path:

```text
/opt/homelab/posthog
```

High-level steps:

1. SSH into the homelab:

   ```sh
   ssh homelab-lan
   ```

2. Create the PostHog deployment directory:

   ```sh
   sudo mkdir -p /opt/homelab/posthog
   sudo chown -R "$USER":"$USER" /opt/homelab/posthog
   ```

3. Install PostHog using the current official self-hosted Docker Compose instructions.

4. Configure the public URL:

   ```env
   SITE_URL=https://analytics.ericventor.com
   ```

5. Configure required secrets:

   ```env
   SECRET_KEY=<generated secret>
   ENCRYPTION_SALT_KEYS=<generated secret>
   ```

6. Configure reverse proxy / DNS so `https://analytics.ericventor.com` routes directly to the homelab PostHog web service.

7. Configure PostHog CORS/CSRF for deployed app origins.

8. Create a PostHog project and copy the project token.

9. Store project app env values:

   ```env
   POSTHOG_PROJECT_TOKEN=<project token>
   POSTHOG_HOST=https://analytics.ericventor.com
   ```

10. Smoke test from local and from a deployed app/runtime:

   ```sh
   curl -i https://analytics.ericventor.com
   ```

PostHog's self-hosting docs currently describe Docker Compose as the recommended self-hosted deployment path and list Docker Engine 20.10+, Docker Compose v2.0+, 4GB RAM minimum, and 8GB+ RAM recommended.

Reference: https://www.mintlify.com/PostHog/posthog/configuration/self-hosting

## App Usage Example

Expected application wiring:

```ts
import { Analytics } from "@templar/analytics";
import { postHogAnalyticsLayer } from "@templar/analytics/posthog";

const AnalyticsLive = postHogAnalyticsLayer({
  apiKey: process.env.POSTHOG_PROJECT_TOKEN,
  host: process.env.POSTHOG_HOST ?? "https://analytics.ericventor.com",
  defaultProperties: {
    app: "hello-world",
    environment: process.env.NODE_ENV ?? "development",
  },
});

const program = Analytics.track({
  distinctId: "user_123",
  event: "project created",
  properties: {
    projectId: "project_123",
  },
  groups: {
    organization: "org_123",
  },
});
```

## Implementation Order

1. Replace the analytics stub with core `types.ts`, `errors.ts`, `driver.ts`, `logging.ts`, and `service.ts`.
2. Update root exports from `packages/analytics/src/index.ts`.
3. Update `packages/analytics/package.json` exports, module type, dependencies, and test script.
4. Implement `src/drivers/posthog.ts`.
5. Add service tests.
6. Add PostHog driver tests with fake `fetch`.
7. Run:

   ```sh
   pnpm --filter @templar/analytics typecheck
   pnpm --filter @templar/analytics test
   pnpm --filter @templar/analytics check
   ```

8. Deploy/configure PostHog on the homelab.
9. Add app-level env vars and wire `postHogAnalyticsLayer` into the first project.
10. Send a smoke test event and confirm it appears in PostHog.

## Later Work

- Add a browser-specific `posthog-js` integration only when a frontend app needs autocapture, pageviews, or session replay.
- Add batch endpoint support only if immediate sends become a measured performance problem.
- Add privacy controls and event naming conventions once the first real product events exist.
