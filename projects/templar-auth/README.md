# Templar Auth

Canonical identity and SSO for Templar Labs sites. Better Auth owns users, provider accounts,
sessions, verification records, and signing keys here. Applications receive a stable canonical
user ID through a short-lived first-party handoff.

## Google OAuth client

Use a Google OAuth **Web application** client with no Authorized JavaScript origins and these
Authorized redirect URIs:

- `http://localhost:5181/api/auth/callback/google`
- `https://auth.ericventor.com/api/auth/callback/google`

The credential values are read from the ignored root `.env` as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. They must also exist as encrypted GitHub Actions repository secrets.

## Local development

The auth service runs on `http://localhost:5181`. Emma runs on `http://localhost:5180`. Run both
projects when testing the complete local flow.

## First-party applications

There is no per-application OAuth client registry. Production handoffs accept the standard
`/api/auth/callback` path on `ericventor.com` and its HTTPS subdomains; local auth accepts loopback
callbacks. All handoff tokens use the shared `templar-first-party` audience.

Authorization codes live in Better Auth's `verification` table for at most 60 seconds and are
deleted atomically during PKCE exchange. This is transient protocol state, not a durable record of
which products a user has visited.

Global administrators are canonical user IDs in
`apps/web/src/lib/access.ts`. Changing the set intentionally requires a deploy. If the central
database is empty, sign in once, read the new canonical ID, add it to that set, and deploy again.
