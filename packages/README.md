# Packages

`packages/*` contains reusable Templar Labs opinionated building blocks for
projects in this monorepo.

The goal is not to create generic open source libraries. The goal is to encode
the choices that Templar Labs projects should use by default, so new side
projects can start from known working patterns instead of rebuilding common app
plumbing each time.

## Mindset

Each package should provide an opinionated abstraction over one recurring
concern:

- `@templar/config` owns app config and secret-reading conventions.
- `@templar/logger` should own structured logging conventions.
- `@templar/db` should own database access and migration conventions.
- `@templar/auth` should own authentication conventions.
- `@templar/ai` should own model-provider conventions.
- `@templar/email` owns transactional email conventions.
- `@templar/deploy` owns infrastructure and deployment conventions.
- `@templar/blob` owns object storage conventions.
- `@templar/cache` owns cache and key-value storage conventions.
- `@templar/queue` owns background queue conventions.
- `@templar/analytics` owns product analytics conventions.
- `@templar/payments` should own payment-provider conventions.
- `@templar/ui` owns shared React UI primitives and styling conventions.
- `@templar/assets` owns shared brand and default app assets.
- `@templar/tsconfig` owns shared TypeScript configuration presets.

Some packages will be self-created implementations. Others will wrap external
libraries. In both cases, app code should depend on the Templar package when
there is a meaningful local convention to preserve.

These packages are for this monorepo first. They should be designed as shared
internal product infrastructure, not as open-ended SDKs. When a package is used
across projects, the package should make the recurring decisions ahead of time
and expose the simplest useful contract to consuming services.

Prefer APIs that encode Templar defaults:

- Consumers should choose intent, not implementation details.
- Provider choice, fallback behavior, retry policy, logging, and config names
  should live inside the package when they are repo-wide conventions.
- Escape hatches should be rare and added only after a real project needs them.
- Avoid exposing raw provider concepts, driver names, model IDs, storage
  implementation details, or fallback lists unless the consuming service is
  genuinely responsible for that choice.
- Do not expose configuration knobs just because the underlying provider has
  them. Expose a knob only when a consuming service owns that decision.
- Keep fallback chains, provider-specific request shapes, and generated
  defaults inside the package. Tests can inspect internals through package-local
  helpers, but app code should not assemble them.

For example, an AI consumer should select a curated tier such as `balanced` or
`auto`, not provider model IDs or fallback chains. The AI package owns those
model choices because they are shared Templar Labs decisions. Likewise, a blob
consumer should use the blob service contract, not directly depend on R2 object
shapes unless it is wiring the provider layer.

The standard should be: package APIs are small because complexity has been
encapsulated, not because behavior is missing.

Package reviews should ask:

- Is this option a real product decision for the caller, or just provider
  leakage?
- Can this be represented as a Templar-level intent instead of a raw vendor
  setting?
- Would every app choose the same value? If yes, encode it in the package.
- Does this abstraction delete repeated app code? If not, it may be the wrong
  abstraction.

## Default Providers

Provider-backed packages should expose a Templar default provider from the root
package. Consumers should not have to choose a provider for normal app code.

Expose both root constructors and root layers for the default provider:

```ts
import { aiLayer, makeAI } from "@templar/ai";
import { analyticsLayer, makeAnalytics } from "@templar/analytics";
import { blobLayer, makeBlob } from "@templar/blob";
import { cacheLayer, makeCache } from "@templar/cache";
import { databaseLayer, makeDatabase } from "@templar/db";
import { emailLayer, makeEmail } from "@templar/email";
import { makeQueue, queueLayer } from "@templar/queue";
```

These names mean "use the Templar default":

- `@templar/ai` defaults to OpenRouter.
- `@templar/blob` defaults to R2.
- `@templar/cache` defaults to KV.
- `@templar/db` defaults to D1.
- `@templar/email` defaults to Cloudflare Email Workers.
- `@templar/queue` defaults to Cloudflare Queues.
- `@templar/analytics` defaults to PostHog.

Root package APIs should stay provider-agnostic after construction. Provider
details such as R2, KV, D1, OpenRouter, model IDs, fallback chains, request
formats, or vendor clients should not appear in operation inputs unless that is
the actual domain being modeled.

Use `makeThing(...)` for direct app code that already has runtime bindings in
hand:

```ts
const blob = makeBlob(bindings.R2);

const result = await Effect.runPromise(blob.text("counter/value.txt"));
```

Use `thingLayer(...)` when composing reusable Effect programs or higher-level
packages that should receive dependencies from the outside:

```ts
const program = BlobStorage.text("counter/value.txt");

const result = await Effect.runPromise(
  program.pipe(Effect.provide(blobLayer(bindings.R2))),
);
```

Provider-specific constructors should not be exposed until a real project needs
to opt out of the default. When that happens, add an explicit provider subpath
without changing the root contract.

The standard shape is:

- `@templar/package`: default Templar provider through both `makeThing(...)`
  and `thingLayer(...)`.
- `@templar/package/provider`: explicit provider constructors only after a real
  project needs them.
- operation methods stay provider-agnostic and identical across providers.

## Effect

Effect is the default wrapper model for non-UI packages when it fits the
problem.

Use Effect to make package boundaries explicit:

- `Config` for environment variables, secrets, defaults, and validation.
- `Context.Tag` and `Layer` for services that apps can provide, compose, and
  replace in tests.
- typed errors for expected failures that callers should handle.
- `Schedule`, `Retry`, and `Duration` for retries, backoff, and timeouts.
- scoped resources for clients, connections, queues, and lifecycle-managed
  dependencies.

Effect should not be used as decoration. If a package only exports constants,
types, CSS, static assets, React components, or simple pure helpers, plain
TypeScript is fine.

## Package Shape

Prefer a small public API:

```txt
packages/example/
  src/
    index.ts
    config.ts
    service.ts
    errors.ts
```

`index.ts` should export the intended public surface. Internal files can exist,
but projects should not reach around the package boundary unless there is an
explicit subpath export.

Common non-UI package exports should usually include:

- config descriptors, such as `ExampleConfig`.
- service tags, such as `ExampleService`.
- live layers, such as `ExampleLive`.
- test or memory layers when useful, such as `ExampleTest`.
- typed domain errors.
- small pure helpers only when they are part of the package contract.

## Abstraction Rule

Wrap a dependency when the wrapper buys something real:

- stable Templar naming and defaults
- less vendor coupling in app code
- consistent Effect services and config
- consistent errors and logging
- easier local testing
- simpler future replacement

Do not wrap a dependency just to rename every method. If app code would still
need to understand the full underlying library, expose a thinner helper or let
the app use the library directly.

## Provider-Backed Services

When a package can have multiple provider implementations, keep provider files
thin. Provider modules should implement only the primitive driver contract and
translate provider-specific shapes into package-domain types.

Shared service modules should own:

- full service assembly from a primitive driver.
- derived methods built from primitive methods.
- typed package errors and generic async boundary helpers.
- cross-cutting behavior such as logging, tracing, metrics, retries, and
  timeouts.

For Effect services, represent meaningful absence with `Option` at the package
boundary. Keep `null` and `undefined` at external API boundaries or in plain
provider input/output shapes when those APIs require them.

Use `driver.ts` for the shared provider contract and driver helper utilities.
Put concrete provider implementations under `drivers/`, such as
`drivers/r2.ts`. Driver files are internal by default; expose a provider subpath
only when the repo has an actual consumer that must opt into a non-default
provider.

For example, `@templar/blob` provider implementations should implement the
primitive storage driver (`put`, `get`, `head`, `delete`, `list`). The shared
blob service should assemble `getOrFail`, `text`, `json`, `arrayBuffer`, and
logging so future R2, S3, local, or test providers get consistent behavior.

## Runtime Assumptions

The default deployment target is Cloudflare, with local development as the only
other environment.

Shared packages should assume:

- `APP_ENV` is either `local` or `prod`.
- runtime secrets are distributed to deployed apps by deployment code, usually
  through Cloudflare bindings configured by `@templar/deploy`.
- packages read and validate config; they do not distribute secrets.
- browser-safe public config must be modeled separately from server-only
  secrets.

## Implementation Order

Prefer implementing packages in dependency order:

1. config
2. logger
3. db
4. auth
5. ai
6. email
7. blob
8. cache
9. queue
10. analytics
11. payments

This order keeps foundational conventions available before higher-level
packages need them.
