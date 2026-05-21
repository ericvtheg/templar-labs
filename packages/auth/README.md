# Auth

`@templar/auth` owns the repository authentication convention. Apps should use
this package to create Better Auth instances, auth clients, shared schema, and
the Effect auth service instead of rebuilding those pieces locally.

## Package Boundary

The package should assemble repeated auth behavior:

- Better Auth defaults such as app name, cookie prefix, account linking,
  password hashing, and TanStack Start cookies.
- shared Drizzle auth schema.
- shared auth table migrations.
- session lookup and typed auth failures.
- derived service methods such as `requireUser` and `requireTenant`.

Consuming apps should provide runtime bindings and product facts:

- Cloudflare D1 binding.
- auth base URL and secret.
- OAuth credentials.
- optional app-specific auth schema additions.
- optional tenant resolver when the app has real multi-tenant rules.

The default tenant convention is the authenticated user id. This keeps
single-user apps from implementing tenant plumbing and gives multi-tenant apps a
small resolver hook without making them rebuild the auth service.

```ts
import { authLayer, makeAuthService } from "@templar/auth";

const authService = makeAuthService({
  api: auth.api,
});

const authLive = authLayer({
  api: auth.api,
});
```

For multi-tenant apps, keep only the tenant lookup local:

```ts
const authService = makeAuthService({
  api: auth.api,
  tenant: (session) => lookupActiveTenant(session.user.id),
});
```

Apps should not construct an `AuthService` object by hand unless they are in a
test and intentionally replacing the whole service.

## Database Migrations

`@templar/auth` owns the SQL migrations for Better Auth tables. Apps should not
recreate those migrations with Drizzle Kit.

Use the package deploy helper when declaring a D1 database:

```ts
import { withAuthMigrations } from "@templar/auth/deploy";
import { d1Database } from "@templar/deploy/cloudflare";

const db = await d1Database("db", withAuthMigrations({
  project: "hello-world",
  migrationsDirs: ["db/migrations"],
}));
```

Project Drizzle configs should point at project-owned tables only:

```ts
// db/drizzle.config.ts
export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  schema: "./schema.ts",
});
```

Runtime code should import typed auth tables from the root package when it
needs them:

```ts
import { user } from "@templar/auth";
```

Most project `db/schema.ts` files should contain only project-owned tables. When
an app truly wants one runtime schema object that includes auth tables, compose the
package-owned schema explicitly:

```ts
import { authSchema } from "@templar/auth";
import * as appSchema from "./schema.ts";

export const schema = {
  ...authSchema,
  ...appSchema,
};
```
