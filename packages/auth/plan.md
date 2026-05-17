# Templar Auth Plan

`@templar/auth` should be the reusable auth boundary for Templar Labs apps. Apps
should depend on Templar conventions, not on raw provider setup, while the
package can use a proven auth engine underneath.

## Goals

- Provide one auth package that every project can reuse.
- Support project-level tenancy by default.
- Support app-level users, sessions, OAuth accounts, and later organizations.
- Fit the current stack: TanStack Start, Cloudflare Workers, D1, Drizzle, and
  Effect.
- Keep app setup small and predictable.
- Make local development and production deployment use the same auth model.

## Non-Goals

- Do not build password hashing, OAuth flows, session cookies, or account
  linking from scratch.
- Do not make a fully generic open source auth abstraction.
- Do not hide external provider setup. OAuth apps, callback URLs, and secrets
  are still explicit deployment inputs.

## Recommended Engine

Use Better Auth as the underlying auth engine.

Reasons:

- Framework-agnostic TypeScript API.
- Supports TanStack Start handlers and cookie behavior.
- Supports email/password and OAuth providers.
- Supports Drizzle-backed databases.
- Has organization and access-control plugins for product-level tenancy later.

`@templar/auth` should wrap Better Auth with Templar defaults and helper APIs.
Apps should not configure Better Auth directly unless they need an explicit
escape hatch.

## Tenancy Model

There are two tenant layers:

1. Project tenant

   A deployed project/app boundary such as `hello-world`, `ui-showcase`, or a
   future customer-facing app. Each project tenant should have its own auth
   secret, base URL, cookie namespace, OAuth credentials, and database binding.

2. Product tenant

   A user-facing organization, workspace, team, or account inside one project.
   This should be modeled after base auth works, likely with Better Auth's
   organization/access-control support.

Default rule:

```txt
project tenant = deployment/app boundary
product tenant = workspace/org boundary inside the app
```

## Package Shape

Initial files:

```txt
packages/auth/src/
  index.ts
  config.ts
  errors.ts
  schema.ts
  service.ts
  tanstack-start.ts
  client.ts
```

Public API candidates:

```ts
createTemplarAuth(...)
createTemplarAuthClient(...)
getSession(...)
requireUser(...)
requireTenant(...)
authSchema
Auth
AuthConfig
AuthError
```

Keep the public API intentionally small. Add provider-specific subpath exports
only when they clarify app code.

## Database Plan

Use Drizzle schema as the source of truth for auth tables.

Apps should be able to compose shared auth schema with app-specific schema:

```ts
export * from "@templar/auth/schema";
export * from "./app-schema.ts";
```

Then the existing project migration workflow can generate and apply migrations
for both auth and app tables.

This keeps auth aligned with the existing `@templar/db` and `scripts/db.mjs`
conventions.

## Server API

Each app should create one auth instance from its runtime bindings:

```ts
import { createTemplarAuth } from "@templar/auth/tanstack-start";
import * as schema from "../../db/schema.ts";

export async function getAuth() {
  const { env } = await import("cloudflare:workers");

  return createTemplarAuth({
    project: "hello-world",
    app: "web",
    baseURL: env.AUTH_BASE_URL,
    secret: env.AUTH_SECRET,
    db: env.DB,
    schema,
    oauth: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
  });
}
```

The TanStack Start route should forward auth requests:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "../../lib/auth.server.ts";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => (await getAuth()).handler(request),
      POST: async ({ request }) => (await getAuth()).handler(request),
    },
  },
});
```

## Effect Integration

Expose an Effect service for app server functions:

```ts
export class Auth extends Context.Tag("@templar/auth/Auth")<
  Auth,
  AuthService
>() {}
```

Useful service methods:

```ts
getSession(request)
requireUser(request)
requireTenant(request)
```

`requireUser` should return a typed `AuthUnauthorizedError` instead of throwing
framework-specific responses. Route handlers can decide whether to return JSON,
redirect, or render an error.

## OAuth Plan

OAuth should be opt-in per project.

The Templar config shape should be explicit:

```ts
oauth: {
  github?: {
    clientId: string;
    clientSecret: string;
  };
  google?: {
    clientId: string;
    clientSecret: string;
  };
}
```

Provider setup rules:

- Each project tenant should usually have separate OAuth app credentials.
- Each OAuth app needs production callback URLs.
- Each OAuth app needs local development callback URLs.
- Missing provider config means that provider is disabled.

Expected callback URL shape:

```txt
https://<project-domain>/api/auth/callback/<provider>
http://localhost:<port>/api/auth/callback/<provider>
```

Deployment inputs:

```txt
AUTH_SECRET
AUTH_BASE_URL
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Account linking should be conservative by default:

- Same verified email may link accounts.
- Unverified email must not automatically link accounts.
- Provider-specific IDs remain the durable OAuth account identifiers.

## Client API

Provide a React-friendly client wrapper:

```ts
import { createTemplarAuthClient } from "@templar/auth/client";

export const authClient = createTemplarAuthClient();
export const { signIn, signOut, useSession } = authClient;
```

Apps can build their own forms and buttons using the shared client. The auth
package should not own app-specific UI.

## Deployment

Later, `@templar/deploy` should provide auth secret helpers so project auth
configuration is repeatable.

Target deployment shape:

```ts
const auth = await authConfig("auth", {
  project: "hello-world",
  baseURL: "https://hello-world.ericventor.com",
});

export const website = await tanstackStartApp("website", {
  bindings: {
    DB: db,
    AUTH_SECRET: auth.secret,
    AUTH_BASE_URL: auth.baseURL,
  },
});
```

Do not share auth secrets across project tenants by default.

## Implementation Order

1. Add Better Auth dependencies to `packages/auth`.
2. Add package exports for root, schema, client, and TanStack Start helpers.
3. Define shared auth Drizzle schema.
4. Implement `createTemplarAuth` with Templar defaults.
5. Add typed auth errors.
6. Add Effect service helpers for `getSession` and `requireUser`.
7. Integrate `hello-world` as the first consumer.
8. Generate and apply auth migrations through the existing DB workflow.
9. Add OAuth provider config for GitHub first.
10. Add React client wrapper and a minimal sign-in/sign-out flow.
11. Add tests around config validation and guard behavior.
12. Add organization/workspace support after base auth is stable.

## Open Questions

- Should each app have a separate D1 database, or should some projects share a
  project-level database across multiple apps?
- Should email/password be enabled by default, or should OAuth-only apps be a
  first-class mode?
- Which OAuth providers are standard for Templar apps: GitHub, Google, or both?
- Should auth redirects be app-controlled or standardized by the package?
- Should organization/workspace tables live in `@templar/auth/schema` from day
  one or be added after the first app integration?
