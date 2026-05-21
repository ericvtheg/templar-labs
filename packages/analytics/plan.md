# Analytics Package Plan

## Vision

Templar projects should be able to add product analytics with a small, stable
Templar API while keeping PostHog-specific details behind a provider driver.

The initial provider is a self-hosted PostHog instance running in a homelab.
The package should make that deployment detail easy to configure without
spreading PostHog client setup, host URLs, API keys, event naming, or identity
rules across app code.

The target experience is:

> Give a Templar app an analytics service, call a few obvious methods from
> server and client code, and get consistent events, identities, and feature
> flag checks in PostHog.

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

## Primary V1 API Patterns To Clarify

The PostHog surface area is large. Before implementing, decide which of these
patterns should be first-class in v1.

### 1. Event Capture

Recommended v1 default:

```ts
Analytics.capture({
  event: "project.created",
  userId,
  properties: {
    projectId,
    source: "dashboard",
  },
});
```

Open questions:

- Should the primary identifier be named `userId`, `distinctId`, or support
  both with one normalized internal field?
- Should anonymous events be allowed in v1, or should capture require a known
  user/session identity?
- Should event names be plain strings, or should apps define typed event maps?
- Should the package add default properties such as app name, environment,
  project key, deployment ID, or request ID?
- Should capture be fire-and-forget, or should callers always receive an
  Effect that can fail if PostHog is unavailable?

### 2. Identity

Recommended v1 default:

```ts
Analytics.identify({
  userId,
  properties: {
    email,
    name,
  },
});
```

Open questions:

- Do we want `identify` in v1, or is event capture with user properties enough
  initially?
- Should the package expose `alias` for anonymous-to-known-user merging?
- Which user properties are acceptable defaults, and which should apps pass
  explicitly to avoid leaking unnecessary personal data?
- Should identity calls be server-only, client-only, or supported in both?

### 3. Feature Flags

Recommended v1 default:

```ts
Analytics.getFeatureFlag({
  key: "new-onboarding",
  userId,
  properties,
});
```

Open questions:

- Are PostHog feature flags in scope for v1, or should v1 only capture events?
- Should flags return only boolean values, or support string payloads and
  multivariate values?
- Should missing flag evaluation fail closed with a default value?
- Should we expose `isFeatureEnabled` as the simple boolean API and keep
  `getFeatureFlag` for advanced cases?
- Should flag calls be server-side only at first?

### 4. Page And Screen Views

Recommended v1 default:

```ts
Analytics.page({
  path: "/settings/billing",
  title: "Billing settings",
  userId,
  properties,
});
```

Open questions:

- Should page views be a separate API, or should apps call `capture` with a
  conventional event name?
- Do we need TanStack Start route helpers for automatic page view capture?
- Should client-side autocapture be enabled, disabled, or left to app code?

### 5. Groups And Tenancy

Recommended v1 default:

```ts
Analytics.group({
  type: "project",
  key: projectId,
  userId,
  properties: {
    projectName,
  },
});
```

Open questions:

- Are PostHog groups needed in v1 for project/team/workspace analytics?
- What should the standard group keys be: `app`, `project`, `tenant`,
  `organization`, or something else?
- Should every event carry `app` or `projectKey` properties even when PostHog
  groups are not used?

### 6. Server And Client Runtime Split

Recommended v1 default:

- Server package API first.
- Browser helper second, if a real app needs direct client capture.
- Do not expose the PostHog personal API key to browser code.

Open questions:

- Will v1 analytics calls mostly happen on the server, in the browser, or both?
- Should browser events be sent directly to PostHog or proxied through app
  routes?
- Do we need a `createAnalyticsClient` browser API separate from the Effect
  service?
- Should the package include TanStack Start route helpers for event ingestion?

### 7. Privacy And Controls

Recommended v1 default:

```ts
Analytics.capture({
  event,
  userId,
  properties,
  context: {
    consent: "granted",
  },
});
```

Open questions:

- Should the package require an explicit consent state before sending events?
- Should analytics be disabled by default in local development and tests?
- Should apps be able to configure event/property allowlists?
- Should sensitive property names be blocked or redacted by default?
- Should the package provide a no-op driver for tests, local development, and
  privacy-disabled environments?

## Proposed Initial Service Surface

This is the narrowest useful v1 if event capture and feature flags are both in
scope:

```ts
export type AnalyticsService = {
  readonly capture: (input: CaptureEventInput) => Effect.Effect<void, AnalyticsError>;
  readonly identify: (input: IdentifyUserInput) => Effect.Effect<void, AnalyticsError>;
  readonly getFeatureFlag: (
    input: GetFeatureFlagInput,
  ) => Effect.Effect<FeatureFlagValue, AnalyticsError>;
};
```

Potential additions if explicitly chosen for v1:

- `page(input)`
- `alias(input)`
- `group(input)`
- `isFeatureEnabled(input)`
- `flush()`
- `shutdown()`

## Proposed Initial Configuration

The PostHog driver should be configurable from app code or Effect config:

```ts
makePostHogAnalytics({
  host: "https://posthog.example.internal",
  projectApiKey,
  personalApiKey,
  defaults: {
    app: "launch-room",
    environment: "prod",
  },
});
```

Open questions:

- What is the actual homelab PostHog base URL shape?
- Do apps have one PostHog project each, or do multiple Templar apps share one
  PostHog project with an `app` property?
- Which secrets should be required for v1: project API key only, or project API
  key plus personal API key for feature flags/admin operations?
- Should config use `@templar/config` helpers for secrets and environment?

## Intentional Deferrals

Unless a real project needs them immediately, v1 should defer:

- cohorts management
- surveys
- experiments management
- dashboards and insights API
- session replay controls beyond basic enable/disable configuration
- data export
- plugin management
- PostHog organization/project provisioning
- full generated typed analytics schema
- cross-provider support beyond the internal driver boundary

## First Implementation Milestones

1. Confirm the primary v1 API surface from the questions above.
2. Add package files following the repo pattern:
   `types.ts`, `errors.ts`, `logging.ts`, `driver.ts`, `service.ts`,
   `drivers/posthog.ts`, and public exports.
3. Implement a minimal PostHog driver for server-side `capture`.
4. Add validation, provider error normalization, and operation logging.
5. Add a no-op or memory test driver if local tests need deterministic
   analytics behavior.
6. Add focused tests for validation, default property merging, provider error
   mapping, and service-to-driver translation.
7. Add feature flag and identity APIs only after the v1 pattern is confirmed.

## Clarification Checkpoint

Before writing code, decide the answers to these highest-impact questions:

1. Is v1 event capture only, or capture plus identify plus feature flags?
2. Are events emitted server-side only, browser-side only, or both?
3. Do we use `userId`, `distinctId`, or a normalized Templar identity type?
4. Do multiple apps share one PostHog project, or does each app get its own
   PostHog project?
5. Should analytics fail the calling workflow when PostHog is unavailable, or
   should failures be logged and swallowed by default?
6. Should privacy controls such as consent, disabled environments, and
   redaction be part of v1?
