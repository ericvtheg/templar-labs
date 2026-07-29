# API Auth

`@templar/api-auth` gives each Templar application its own API-key credential realm. It owns key
generation, hashed storage, app isolation, permissions, revocation, and standard TanStack Start
request handling. It does not create a central Breli-wide key or decide access to app-owned data.

Each app defines an audience, visible key prefix, permission catalog, and key policy:

```ts
import { defineApiAuthManifest } from "@templar/api-auth";

export const apiAuthManifest = defineApiAuthManifest({
  audience: "your-shopper:web",
  keyPrefix: "ys_live_",
  permissions: {
    hello: ["read"],
  },
  keys: {
    defaultExpiresInDays: 90,
    maximumExpiresInDays: 365,
    maximumActivePerUser: 10,
  },
});
```

The package stores only an HMAC digest of the secret. The complete key is returned once by
`createKey`; list operations expose only safe metadata. Rotation is performed by creating a
replacement and revoking the old key. Server secrets are versioned so applications can rotate their
HMAC secret without immediately invalidating existing keys.

Apps should use a distinct key per agent or integration. Permission checks authorize an API
operation, while the consuming app remains responsible for object-level authorization.

## Database migrations

The package owns its table and migration. Compose it into an app's D1 migrations:

```ts
import { withApiAuthMigrations } from "@templar/api-auth/deploy";
import { d1Database } from "@templar/deploy/cloudflare";

const db = await d1Database("db", withApiAuthMigrations({
  project: "your-shopper",
  migrationsDirs: [],
}));
```
