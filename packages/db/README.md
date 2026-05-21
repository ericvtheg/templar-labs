# @templar/db

Shared database conventions for Templar Labs projects.

This package is intentionally thin. Drizzle owns schemas, migrations, and typed
queries. `@templar/db` owns the Templar wiring around Drizzle: Effect services,
Cloudflare D1 construction, and logging annotations.

The shape mirrors `@templar/blob`:

- `service.ts` exposes the Effect service tag and layer constructor.
- `drivers/d1.ts` translates a Cloudflare D1 binding into the shared service.
- `errors.ts` keeps expected database failures typed.

## Project Schema

Schemas should live with the project that owns the data model:

```txt
projects/example/
  db/
    schema.ts
    migrations/
      0000_initial.sql
    db.config.mjs
    drizzle.config.ts
  apps/web/
```

Example schema:

```ts
import { integer, sqliteTable, text } from "@templar/db/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

## Cloudflare D1

```ts
import { databaseError, makeDatabase } from "@templar/db";
import { Effect } from "effect";
import * as schema from "../../../db/schema";

const database = makeDatabase(env.DB, { schema });

const program = Effect.gen(function* () {
  return yield* Effect.tryPromise({
    try: () => database.db.select().from(schema.users),
    catch: (cause) =>
      databaseError({
        operation: "select",
        cause,
      }),
  });
});

await Effect.runPromise(program);
```

Apps still use normal Drizzle APIs. The package boundary exists so every app
gets the same provider construction, Effect dependency injection, and error
shape.

## Migrations

Migrations are project workflow, not runtime library behavior.

By default each project should own its Drizzle schema, generated migration
files, and `db.config.*` file. Apps in the project reuse that database through
the project backend/service layer. Root commands provide one monorepo entry
point:

```sh
pnpm db:generate example
pnpm db:migrate:local example
pnpm db:migrate:prod example
pnpm db:migrate:ci
```

Minimal project config:

```ts
// projects/example/db/db.config.mjs
export default {
  provider: "d1",
  databaseName: "example",
  drizzleConfig: "drizzle.config.ts",
  wranglerConfig: "wrangler.jsonc", // optional
};
```

For all providers, `pnpm db:generate <project>` runs Drizzle Kit from the
project database directory with that project's Drizzle config. For D1,
`pnpm db:migrate:*` runs Wrangler from the same directory when `wranglerConfig`
is set, so the DB config can own D1 details such as bindings and
`migrations_dir`. If `wranglerConfig` is omitted, the command skips that project
and expects deploy-time infrastructure, such as Alchemy, to apply D1 migrations.
For Postgres and libSQL, migrate dispatches to `drizzle-kit migrate`.

Deploy CI runs `pnpm db:migrate:ci`, which applies prod migrations for every
project that has a `db.config.*` file before deployment. Projects without DB
config are skipped. App-level DB configs are legacy/exceptional and should not
be mixed with a project-level DB config.

## Package-Owned Tables

Packages can own tables and migrations when the tables are part of a shared
package contract. `@templar/auth` is the first example: it owns Better Auth
tables and ships package migrations.

Projects should keep migration schemas focused on project-owned tables. When a
project uses package-owned tables:

- `db/schema.ts` should usually contain only project-owned tables and should be the
  schema used by Drizzle Kit migration generation.
- runtime code that needs package-owned tables should import them from the
  owning package, such as `import { user } from "@templar/auth"`.
- if a runtime needs one combined schema object, compose it explicitly from
  package-owned schema objects and project-owned schema objects.

The deploy layer can compose package and app migration directories into one D1
migration stream:

```ts
const db = await d1Database(
  "db",
  withAuthMigrations({
    project: "hello-world",
    migrationsDirs: ["db/migrations"],
  }),
);
```

The lower-level equivalent is still available when package helpers are not
appropriate:

```ts
const db = await d1Database("db", {
  project: "hello-world",
  migrationsDirs: [authMigrationsDir, "db/migrations"],
});
```

Use the same idea at the project database resource: one database declares every
package/project migration directory that contributes tables to that database,
then multiple apps bind to the same database. Avoid having multiple apps
independently apply migrations to the same shared database.
