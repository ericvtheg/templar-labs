# Templar Health Exporter

First vertical slice for Eric's Apple Health exporter: an authenticated, versioned ingestion API and
a native Swift transport/HealthKit boundary. The only canonical sample type in v1 is body mass in
integer grams.

## Layout

- `apps/web`: TanStack Start Server Route, Zod v1 contracts, Effect domain service, and D1 adapter
- `db`: Drizzle schema and D1 migration
- `packages/apple`: Swift Package transport models/client plus guarded HealthKit mapping abstractions
- `docs/adr`: architecture, privacy, reconciliation, and verification decisions

## Install and verify on Linux

From the repository root:

```sh
corepack pnpm install
pnpm --filter health-exporter-web test
pnpm --filter health-exporter-web typecheck
pnpm --filter health-exporter build
pnpm check
pnpm test
pnpm build
```

If Swift 6 is installed, the platform-independent subset can also be checked:

```sh
swift test --package-path projects/health-exporter/packages/apple
```

That command on Linux does **not** compile or validate HealthKit code. Apple-specific compilation is
performed by `.github/workflows/health-exporter-apple.yml` on macOS. Runtime verification still
requires Xcode and a physical iPhone.

## Local D1 setup

Alchemy owns this project's D1 binding and applies `db/migrations` during deployment:

```sh
pnpm --filter health-exporter deploy
```

For local development, start Alchemy once; it creates the local D1 database, generated Wrangler
configuration, and applies the same migrations:

```sh
pnpm --filter health-exporter dev
```

`pnpm db:migrate:local health-exporter` intentionally does not apply anything here because
`db/db.config.mjs` has no stable checked-in Wrangler configuration; the generated configuration is
an Alchemy implementation detail. Do not claim that the helper migrated this database when it
reports that it skipped Wrangler migrations.

Do not put clear device tokens in migrations, source, `.dev.vars`, logs, shell history, or issue
trackers.

## Provision a v1 device token

Provisioning is intentionally an operator action in v1; there is no public token-issuing endpoint.
Generate a token, hash it locally, insert only the hash, then transfer the clear token once into the
iOS Keychain. The following avoids echoing the token:

```sh
read -r DEVICE_ID
read -r INSTALLATION_ID
read -r OWNER_ID
DEVICE_TOKEN="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')"
TOKEN_HASH="$(printf '%s' "$DEVICE_TOKEN" | openssl dgst -sha256 -r | cut -d' ' -f1)"
TOKEN_HINT="$(printf '%s' "$DEVICE_TOKEN" | tail -c 7)"
CREATED_AT="$(date +%s)000"
```

Use parameter binding in an operator script or the Cloudflare dashboard to insert:

```sql
INSERT INTO health_devices
  (id, owner_id, installation_id, display_name, platform, token_hash, token_hint, created_at)
VALUES
  (?, ?, ?, ?, 'ios', ?, ?, ?);
```

The values are `DEVICE_ID`, `OWNER_ID`, `INSTALLATION_ID`, a non-sensitive display name,
`TOKEN_HASH`, `TOKEN_HINT`, and `CREATED_AT`. Display the clear token only into a secure channel:

```sh
printf '%s' "$DEVICE_TOKEN"
unset DEVICE_TOKEN TOKEN_HASH
```

Revoke a device by setting `revoked_at`; do not recycle its token. All requests use:

```http
POST /api/v1/sample-ingestion
Authorization: Bearer <device token>
Content-Type: application/json
```

The canonical request/response definitions are in
`apps/web/src/contracts/v1.ts`; constants are mirrored by validated Swift initializers and checked
against `contracts/v1-valid-request.json`. Request bodies are capped at 1 MiB and batches at 500
total changes. Native clients call this Server Route directly and must never depend on internal
TanStack Server Functions. Production base URLs must use HTTPS. Plain HTTP is accepted only when the
Swift client is explicitly opted into local development and the host is `localhost`, `127.0.0.1`,
or `::1`.

## Privacy and production caveats

Apple Health data and source metadata are sensitive. This project deliberately has no analytics or
payload logging. Before deployment, define retention and account-erasure procedures, restrict
database/operator access, verify TLS and backups, document incident response, and review Apple's
HealthKit rules and the app's privacy disclosures. A bundle ID such as Weight Gurus is preserved as
reported provenance; it is not independently attested.

## Xcode/device next steps

1. Add the Swift package to a signed iOS app target and enable the HealthKit capability.
2. Add purpose strings and request read authorization for `.bodyMass`.
3. Implement `AnchoredBodyMassReading` with `HKAnchoredObjectQuery`.
4. Store installation identity, bearer token, and acknowledged anchor in appropriate Keychain/app
   storage; never advance the anchor before a 2xx response.
5. Verify real Weight Gurus-originated samples and deletion events on a physical iPhone.
6. Test first sync, replay, offline retry, locked-device behavior, revocation, reinstall identity,
   and foreground reconciliation.
7. Only then add and device-test HealthKit background delivery and `BGProcessingTask`.

The macOS CI compile is a compiler/SDK check. It cannot validate entitlements, authorization UX,
actual source provenance, background scheduling, or device data.
