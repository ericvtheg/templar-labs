# API Auth Decisions

## Credential boundary

- API keys belong to one configured application audience.
- There is no cross-application or Breli-wide key in the initial version.
- The audience is checked during every lookup even when applications use separate databases.
- Key ownership uses the canonical user ID. Organization-owned credentials can be added when an
  application has a concrete workspace model.

## Security

- Raw key secrets are returned only at creation and rotation time.
- D1 stores an HMAC-SHA-256 digest, never the raw secret.
- Presented keys contain an opaque record ID so verification performs one indexed lookup.
- HMAC secrets are versioned and supplied through runtime bindings.
- Missing, malformed, expired, revoked, and incorrect credentials share one unauthorized response.
- Permissions grant operations; consuming apps still enforce access to individual domain objects.

## Package boundary

- `@templar/api-auth` does not depend on Better Auth.
- Apps resolve their current browser user with `@templar/auth` or `@templar/users` before managing
  keys.
- The package owns its Drizzle schema and migrations.
- The initial storage adapter targets Cloudflare D1, matching current repository conventions.
- TanStack Start helpers stay thin and use standard `Request` and `Response` objects.

## Intentional deferrals

- Cross-app credentials.
- OAuth, MCP authorization, and agent registration protocols.
- Organization service accounts that do not act as a user.
- A production rate-limiter adapter.
- Per-request audit-event storage.
