# @templar/tsconfig

Shared TypeScript presets for Templar Labs.

The goal of this package is to encode monorepo conventions once and keep apps/packages from drifting. Prefer choosing the preset that matches the kind of thing being built instead of hand-rolling compiler options in each workspace.

## Presets

### `@templar/tsconfig/base`

The strict common baseline used by every other preset.

Use this directly only when none of the more specific presets fit.

### `@templar/tsconfig/library-package`

For reusable TypeScript libraries under `packages/*`.

Examples:

- `packages/logger`
- `packages/ai`
- `packages/auth`
- `packages/db`
- `packages/email`
- `packages/analytics`

This preset assumes generic library code. It does not add browser, React, Node script, or Cloudflare Worker globals.

### `@templar/tsconfig/tanstack-start-app`

For TanStack Start applications under `projects/*`.

In this monorepo, all TanStack Start apps are Cloudflare-hosted by convention. This preset includes the shared app assumptions TypeScript can express:

- React JSX
- DOM types
- Vite client types
- `~/*` alias mapped to `./src/*`
- JSON imports
- JavaScript files allowed where framework tooling needs them

Cloudflare binding/runtime types should come from each app's generated `worker-configuration.d.ts`, created with `wrangler types`, because those types depend on the app's own `wrangler.jsonc`.

### `@templar/tsconfig/cloudflare-worker`

For standalone Cloudflare Workers that are not TanStack Start apps.

Examples:

- scheduled jobs
- webhook proxies
- queue consumers
- small Worker APIs
- Durable Object workers

Use this when the deployable is directly a Worker rather than a full app framework.

### `@templar/tsconfig/node-script`

For local, development, CI, and infrastructure scripts that run under Node.

Examples:

- `alchemy.run.ts`
- migration scripts
- code generation scripts
- content sync scripts
- one-off repo maintenance scripts

This preset includes Node types for APIs like `process`, `fs`, `path`, and `Buffer`.

## Usage

Each workspace should usually have a tiny `tsconfig.json` that extends one preset:

```json
{
  "extends": "@templar/tsconfig/tanstack-start-app"
}
```

or:

```json
{
  "extends": "@templar/tsconfig/library-package"
}
```

Keep app/package-specific options minimal. If multiple workspaces need the same option, move it into the relevant shared preset.
