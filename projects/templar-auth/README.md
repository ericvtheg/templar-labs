# Templar Auth

Canonical identity and SSO for Templar Labs sites. Better Auth owns users, provider accounts,
sessions, verification records, and signing keys here. Applications receive a stable canonical
user ID through a short-lived first-party handoff.

## Google OAuth client

Use a Google OAuth **Web application** client with no Authorized JavaScript origins and these
Authorized redirect URIs:

- `http://localhost:5181/api/auth/callback/google`
- `https://auth.breli.app/api/auth/callback/google`

The credential values are read from the ignored root `.env` as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. They must also exist as encrypted GitHub Actions repository secrets.

## Local development

Consumer applications use `https://auth.breli.app` during local development and return to their
loopback callback, so they do not need a local auth process or Google credentials. Run the auth
service on `http://localhost:5181` only when developing the auth service itself.

## First-party applications

There is no per-application OAuth client registry. Handoffs accept only the standard
`/api/auth/callback` path: HTTPS callbacks on `breli.app`, `ericventor.com`, and their subdomains,
plus HTTP loopback callbacks for local applications. The legacy root remains allowed for existing
applications, but the canonical auth issuer is `auth.breli.app`. All handoff tokens use the shared
`templar-first-party` audience.

Authorization codes live in Better Auth's `verification` table for at most 60 seconds and are
deleted atomically during PKCE exchange. This is transient protocol state, not a durable record of
which products a user has visited.

Applications own their sign-in UI and provider buttons. If the user has no central session, the
first-party authorize endpoint starts Google OAuth immediately; the central service does not show
an intermediate sign-in page.

Global administrators are normalized email addresses in `apps/web/src/lib/access.ts`. Changing the
set intentionally requires a deploy. The central service evaluates the canonical Better Auth
email and signs only the resulting `admin` boolean into application handoffs.
