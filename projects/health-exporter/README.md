# Health Exporter by Breli

A deliberately small personal tool: an Expo iPhone app reads real HealthKit step-count samples
after a button tap and sends them to an authenticated TanStack Start route backed by D1. There is no
billing, multi-user/SaaS layer, background work, analytics, or synthetic health data.

## What is implemented

- apps/mobile: Expo SDK 55 app, expo-secure-store for the server URL, bearer secret, and stable
  device UUID; a local Expo Swift module requests read-only HealthKit access and returns at most 100
  newest step samples from the last seven days. The UI explicitly states this cap; this is not a complete history or a deduplicated daily step total.
- apps/web: POST /api/v1/sample-ingestion ingests a bounded step batch; authenticated
  GET /api/v1/sample-ingestion returns the latest sync and total stored sample count.
- db: D1 migration and schema. (device_id, request_id) makes exact requests replayable and rejects a
  request-ID collision with altered content. (device_id, sample_id) prevents duplicate samples.

The request limit is 64 KiB and 100 samples. Values are non-negative integer counts, individual
sample intervals are limited to two hours, timestamps cannot be in the future, objects are strict,
and bearer values must be 32-512 URL-safe characters. Routes never log the secret or health body.

## Server setup

Generate one high-entropy personal secret locally and keep it out of source, shell history, logs,
and issue trackers. Configure the same value as the deployment secret HEALTH_EXPORTER_SECRET;
Alchemy binds it through alchemy.secret.env. The clear value is entered once in the phone UI and
stored by SecureStore. Do not use an EXPO_PUBLIC variable.

Local verification from the repository root:

    pnpm --filter health-exporter-web test
    pnpm --filter health-exporter-web typecheck
    pnpm --filter health-exporter-web build
    pnpm --filter health-exporter-mobile typecheck

The main-push deployment workflow passes `HEALTH_EXPORTER_SECRET` to Alchemy.
D1 is created by `alchemy.run.ts` and uses `db/migrations`.

## Apple and EAS setup

Use **Actions → Mobile iOS Build and TestFlight → Run workflow** on `main`, with
project `health-exporter`. Every successful build uploads to TestFlight.
See [shared mobile CI setup](../../tools/mobile-ci/README.md) for GitHub variables,
secrets, and future apps.

Before the first CI build, configure signing once from this checkout:

```sh
export IOS_BUNDLE_ID=com.ericvtheg.healthexporter
export APPLE_TEAM_ID=88SXCR9NGU
export EAS_PROJECT_ID=6fca9dc5-bb3d-4bd7-a6c1-54f636050111
export EXPO_OWNER=ericvtheg
cd projects/health-exporter/apps/mobile
pnpm dlx eas-cli@24.7.0 credentials --platform ios
```

Select `internal-testflight`, sign into Apple, and set up the distribution
certificate and provisioning profile for this bundle ID. HealthKit must be enabled.
Credentials stay on EAS; subsequent builds run non-interactively in CI.

The App Store Connect name is **Health Exporter by Breli** and the Apple app ID is
`6814205847`. The phone displays **Health Exporter**. The EAS project slug is
`health-exporter`; its owner is `ericvtheg`.

## Manual device check

1. Install a signed TestFlight build on a physical iPhone.
2. Enter the deployed HTTPS base URL and the matching personal secret.
3. Tap Sync latest 100 samples, approve read-only Steps access, and check inserted/replayed counts.
4. Tap again: a new request may contain the same HealthKit UUIDs and D1 should report them unchanged.
5. Query authenticated GET on the same route to confirm latest sync status.

## Deliberate limitations and blockers

- Foreground, button-driven sync only. No HealthKit observer query, anchored query, background
  delivery, pagination past the latest 100 samples, deletion tracking, or retry queue.
- HealthKit read permission is privacy-preserving: Apple does not disclose whether read access was
  denied. A denied/no-data result therefore appears as an empty sample list and nothing is sent.
- The server stores step samples indefinitely. Define retention/deletion and operator-access rules
  before treating it as production health-data infrastructure.
- CI requires `EXPO_TOKEN`, `EXPO_APPLE_APP_SPECIFIC_PASSWORD`, and remote iOS signing credentials
- Swift/HealthKit compilation, entitlements, signing, TestFlight processing, privacy disclosure, and
  physical-device behavior remain Apple-environment checks.

## Verification and release boundary

Verified locally: project typechecks, backend Vitest tests (including real local D1 via Miniflare),
mobile config/limit/autolinking tests, and built TanStack route smoke in workerd. Test fixtures are
explicitly synthetic test inputs, not device measurements. No HealthKit data was collected here.

    pnpm check:monorepo
    pnpm --filter health-exporter check
    pnpm --filter health-exporter-mobile check
    pnpm --filter health-exporter-web test:smoke
    pnpm exec biome check projects/health-exporter
    pnpm exec oxlint projects/health-exporter

The shell's Node is 22, but `pnpm exec node --version` resolves the repo-managed Node 24.15.0.
Use pnpm commands (or activate Node 24) rather than invoking the shell Node directly.
Native config and pod resolution checks are not Swift compilation or on-device validation.

A push to main triggers backend checks, migrations, and deployment. Mobile builds
are manually dispatched through the shared workflow, and each successful build
is submitted to TestFlight. Apple processing and an internal tester group are
still required before installation. No App Store review or public release is automated.

Do not put health payloads or the personal ingestion secret in `EXPO_PUBLIC`,
EAS build variables, or source control.
