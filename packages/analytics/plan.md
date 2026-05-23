# Analytics Package Plan

## Vision

Templar projects should be able to add product analytics with a small, typed,
server-side Templar API while keeping PostHog-specific details behind a provider
driver.

The initial provider is a self-hosted PostHog instance running in a homelab.
The package should make that deployment detail easy to configure without
spreading PostHog client setup, host URLs, API keys, event naming, identity
rules, or default metadata across app code.

The target experience is:

> Define the app's analytics event map, create a PostHog-backed analytics
> service, and call `track` or `identify` from server code without depending on
> PostHog terminology in app logic.

## Existing Package Pattern To Follow

The package should follow the same shape as mature provider-backed packages in
this repo:

- `src/service.ts` defines the public `AnalyticsService`, an Effect
  `Context.Tag`, `makeAnalyticsService`, and `makeAnalyticsLayer`.
- `src/driver.ts` defines the narrow provider contract used by the service.
- `src/types.ts` owns package-level input and result types.
- `src/errors.ts` defines tagged validation and provider errors.
- `src/logging.ts` wraps operations with package/provider annotations.
- `src/drivers/posthog.ts` adapts PostHog to the Templar driver.
- `src/index.ts` re-exports the public API and the default PostHog helpers.

The Templar API should stay smaller than PostHog's API surface. PostHog remains
the implementation detail for v1, not the type system that every app imports.

## Confirmed V1 Scope

V1 includes:

- typed `track`
- typed `identify`
- server-side usage only
- direct PostHog HTTP API transport through `fetch`
- shared PostHog project support through required Templar metadata
- production-only emission
- provider error logging without blocking app workflows

V1 excludes:

- feature flags
- page view helper
- browser/client analytics helper
- autocapture
- PostHog groups
- consent storage or consent checks
- route helpers
- PostHog project provisioning
- PostHog SDK lifecycle management

Feature flags should become a future `@templar/feature-flags` package if needed.
Consent should become a future durable consent or preferences primitive rather
than being owned by analytics.

## Service Surface

The public API uses `track`, not PostHog's `capture` terminology.

```ts
export type AnalyticsService<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
> = {
  readonly track: <EventName extends keyof Events & string>(
    input: TrackEventInput<Events, EventName>,
  ) => Effect.Effect<void>;

  readonly identify: (
    input: IdentifyUserInput<UserProperties>,
  ) => Effect.Effect<void>;
};
```

`track` and `identify` return effects that do not fail. Validation and provider
errors should be logged and swallowed so analytics never blocks core app flows.

## Typed Events

Apps must define an event map. This prevents event name typos and gives each
event an explicit property shape.

```ts
type AppAnalyticsEvents = {
  "signup.completed": undefined;
  "project.created": {
    projectId: string;
    source: "dashboard" | "template";
  };
};
```

Events with properties must pass `properties`. Events with `undefined`
properties may omit `properties`.

```ts
yield* Analytics.track({
  event: "signup.completed",
  userId,
});

yield* Analytics.track({
  event: "project.created",
  userId,
  properties: {
    projectId,
    source: "dashboard",
  },
});
```

The event map type should include TSDoc recommending lowercase `object.action`
names, such as `project.created`, `deploy.started`, or `user.invited`. The
package should not enforce that format.

## Typed User Properties

Apps must also define the user property shape used by `identify`.

```ts
type AppAnalyticsUserProperties = {
  email?: string;
  name?: string;
  plan?: "free" | "pro";
};

yield* Analytics.identify({
  userId,
  properties: {
    plan: "pro",
  },
});
```

`identify.properties` should be partial so callers can update only the fields
they know at the call site.

## Property Values

Analytics properties must be JSON-safe. Dates should be converted to ISO strings
before being passed to analytics.

```ts
export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<AnalyticsPropertyValue>
  | { readonly [key: string]: AnalyticsPropertyValue };

export type AnalyticsProperties = {
  readonly [key: string]: AnalyticsPropertyValue;
};
```

## Identity

The public API uses `userId`, not `distinctId`.

The PostHog driver maps `userId` to PostHog's `distinct_id`.

Anonymous analytics are out of scope for v1. If anonymous-to-known-user tracking
becomes important later, add a deliberate identity model rather than leaking
provider terminology into app code.

## Runtime

V1 is server-only.

Analytics calls should happen from server routes, server functions, jobs, auth
hooks, webhook handlers, and other server-side workflows. There is no browser
helper and no direct browser PostHog setup in v1.

## PostHog Tenancy

The default model is one shared PostHog project for the Templar portfolio.
Individual project views are achieved through required metadata properties.
Portfolio views can group or filter by the same metadata.

Every service instance must be created with:

- `app`
- `projectKey`
- `environment`

Every emitted PostHog event/person update must include these exact property
names:

```ts
{
  app,
  projectKey,
  environment,
}
```

The package should support one PostHog project per app later by changing
configuration, but the same metadata remains required and useful.

## Configuration

The PostHog helper should use direct HTTP transport through `fetch`, not the
PostHog Node or browser SDK.

```ts
makePostHogAnalytics<AppAnalyticsEvents, AppAnalyticsUserProperties>({
  host: "https://posthog.example.internal",
  projectApiKey,
  app: "launch-room",
  projectKey: "launch-room",
  environment: AppEnvironment.Prod,
  defaultProperties: {
    deploymentId,
  },
});
```

Configuration notes:

- `environment` should use `AppEnvironment` from `@templar/config`.
- Only `AppEnvironment.Prod` emits analytics.
- Non-prod environments no-op.
- `projectApiKey` is required for v1.
- A PostHog personal API key is not required because v1 does not include feature
  flags, admin APIs, or provisioning.
- Optional custom `fetch` may be supported for tests.

## Default Property Precedence

Reserved metadata must always win over caller-provided properties.

Merge order for track events:

```ts
{
  ...defaultProperties,
  ...eventProperties,
  app,
  projectKey,
  environment,
}
```

This prevents event call sites from accidentally changing portfolio/project
partitioning data.

## Failure Behavior

Analytics should not hold up product workflows.

Behavior:

1. If `environment !== AppEnvironment.Prod`, no-op.
2. Validate the event or identify input.
3. Translate the Templar input to the PostHog HTTP request shape.
4. Send with `fetch`.
5. Log provider or validation errors.
6. Return `void` either way.

Provider/network/PostHog failures are swallowed after logging.

## PostHog Mapping

`track` maps to PostHog capture over HTTP.

Templar input:

```ts
{
  event: "project.created",
  userId: "user_123",
  properties: {
    projectId: "project_123",
    source: "dashboard",
  },
}
```

PostHog payload should include:

```ts
{
  api_key: projectApiKey,
  event: "project.created",
  distinct_id: "user_123",
  properties: {
    projectId: "project_123",
    source: "dashboard",
    app: "launch-room",
    projectKey: "launch-room",
    environment: "prod",
  },
}
```

`identify` should map to the simplest PostHog HTTP-compatible identity update
for server ingestion. Keep this mapping in the PostHog driver so app code does
not depend on PostHog event names or special property keys.

## Intentional Deferrals

Unless a real project needs them immediately, v1 should defer:

- feature flags
- page view helper
- browser analytics helper
- route ingestion helpers
- anonymous identity and aliasing
- PostHog groups
- cohorts management
- surveys
- experiments management
- dashboards and insights API
- session replay
- data export
- plugin management
- PostHog organization/project provisioning
- consent storage and consent checks
- cross-provider support beyond the internal driver boundary

## First Implementation Milestones

1. Add package files following the repo pattern:
   `types.ts`, `errors.ts`, `logging.ts`, `driver.ts`, `service.ts`,
   `drivers/posthog.ts`, and public exports.
2. Define generic `AnalyticsService<Events, UserProperties>` with typed
   `track` and `identify`.
3. Implement production-only service behavior using `AppEnvironment`.
4. Implement default property merging with reserved metadata winning.
5. Implement a PostHog HTTP driver using `fetch`.
6. Add validation, provider error normalization, and operation logging.
7. Add focused tests for event typing helpers, validation, non-prod no-op
   behavior, property merging, provider error swallowing, and service-to-driver
   translation.
