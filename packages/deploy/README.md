# @templar/deploy

Shared deployment conventions for Templar Labs projects.

This package is the reusable deployment layer for the monorepo. It should hide
provider and tool details behind project-oriented helpers, while still keeping
the underlying deployment model clear enough to debug.

## Purpose

`@templar/deploy` owns shared deployment building blocks and conventions:

- standard resource naming
- Cloudflare deployment wrappers
- shared defaults for deployable app types
- small utilities used by those wrappers

Project-specific composition still belongs in each project's `alchemy.run.ts`.
Domain-specific resources belong beside the package that owns that domain.

## Package Boundaries

Use `packages/deploy` for generic deployment conventions that can apply across
many projects.

Use package-local deploy folders for resources owned by a domain package:

```txt
packages/storage/
  src/
  deploy/
    r2-bucket.ts
```

Use project-local Alchemy files for final composition:

```txt
projects/hello-world/
  alchemy.run.ts
  apps/
    web/
  packages/
    domain/
```

The project root `alchemy.run.ts` should choose which deploy helpers,
package-owned resources, and apps to compose. This keeps ordering explicit when
a project has multiple apps or shared resources. App folders should contain app
implementation details, not the whole project deployment graph.

Deployable project apps live under `projects/*/apps/*` and must expose a
`deploy` script. Project-local shared packages can live under
`projects/*/packages/*` and do not need a deploy script.

## Proposed Structure

```txt
packages/deploy/
  src/
    cloudflare/
      resources/
        tanstack-start-app.ts
        cloudflare-worker.ts
        r2-bucket.ts
        index.ts
      utils/
        bindings.ts
        index.ts
      index.ts
    naming.ts
    index.ts
```

### `src/cloudflare/resources/tanstack-start-app.ts`

Wrapper for deploying a TanStack Start app to Cloudflare.

Use this for full-stack React apps with routes, SSR, client assets, server
functions, and user-facing web UI.

The exported helper should be named `tanstackStartApp`.

### `src/cloudflare/resources/cloudflare-worker.ts`

Wrapper for deploying a plain Cloudflare Worker.

Use this for lower-level services such as webhooks, queue consumers, cron jobs,
API gateways, background processors, and small HTTP services without React UI.

The exported helper should be named `cloudflareWorker`.

### `src/cloudflare/resources/r2-bucket.ts`

Wrapper for creating an R2 bucket with the same naming conventions used by apps
and workers.

The exported helper should be named `r2Bucket`.

### `src/cloudflare/utils/`

Cloudflare-specific helper code used by the resource wrappers.

Utilities can include binding helpers, Cloudflare environment helpers, and
small shared implementation details. Utilities should not look like deployable
resources and should be exported deliberately.

### `src/naming.ts`

Shared resource naming helpers.

Cloud resources need stable, readable names. Naming should include enough
context to distinguish project and resource purpose. The default assumption is a
single production environment. Helpers may accept optional qualifiers for future
cases, but projects should not model environments unless they actually need
them.

## Example

```ts
import alchemy from "alchemy";
import { r2Bucket, tanstackStartApp } from "@templar/deploy/cloudflare";

const app = await alchemy("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

export const website = await tanstackStartApp("website", {
  project: "hello-world",
  cwd: "apps/web",
  bindings: {
    R2: r2,
  },
});

console.log({ url: website.url });

await app.finalize();
```

## Naming Decisions

Use `tanstackStartApp` for the TanStack Start wrapper.

Use `cloudflareWorker` for a plain Cloudflare Worker wrapper.

These names are intentionally explicit. A TanStack Start app and a plain Worker
both deploy to Cloudflare Workers, but they represent different levels of
application abstraction.

## Alchemy

Alchemy is the implementation tool for deployment orchestration. The public
package name remains `@templar/deploy` so projects are coupled to this repo's
deployment conventions rather than the tool name.
