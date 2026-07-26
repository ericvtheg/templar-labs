# Users

`@templar/users` adds one local application-user row to a D1-backed app after a successful
Templar SSO handoff. Canonical identity remains in `auth.breli.app`; the local table stores
only the canonical ID and app-local timestamps.

```ts
import { createTemplarUserApp } from "@templar/users";

const app = createTemplarUserApp({
  baseURL: "https://example.breli.app",
  issuer: "https://auth.breli.app",
  secret: env.AUTH_SECRET,
  db: env.DB,
});
```

The returned facade exposes `app.handler`, `app.auth.requireUser`, `app.auth.requireAdmin`, and
`app.users.ensureUser`. Its shared callback integration creates `app_users` automatically, so apps
must not handwrite callback upserts.

Use `withUsersMigrations` in the app deployment:

```ts
import { withUsersMigrations } from "@templar/users/deploy";

const db = await d1Database("db", withUsersMigrations({ project: "example" }));
```

Apps that do not need D1 or a local user row should use `createTemplarAuthApp` from
`@templar/auth/app` directly.
