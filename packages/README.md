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
- `@templar/deploy` owns infrastructure and deployment conventions.
- `@templar/blob` owns object storage conventions.
- `@templar/ui` owns shared React UI primitives and styling conventions.

Some packages will be self-created implementations. Others will wrap external
libraries. In both cases, app code should depend on the Templar package when
there is a meaningful local convention to preserve.

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
`drivers/r2.ts`. Public subpath exports can keep stable consumer imports such
as `@templar/blob/r2` even if the file lives under `drivers/`.

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
