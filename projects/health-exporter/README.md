# Personal Apple Health exporter

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

Deployment is intentionally not part of this slice. D1 is created by alchemy.run.ts and uses
db/migrations when the repository's normal deploy workflow is explicitly invoked later.

## Apple and EAS setup

No bundle/team/project identity is invented in source. Before inspecting native config or building,
provide the real values:

    export HEALTH_EXPORTER_BUNDLE_ID='your.registered.bundle.id'
    export APPLE_TEAM_ID='YOURTEAMID'
    export EAS_PROJECT_ID='your-eas-project-uuid'
    pnpm --dir projects/health-exporter/apps/mobile exec expo config --type public

The config declares the HealthKit entitlement and NSHealthShareUsageDescription. The EAS
internal-testflight profile uses store distribution, remote signing credentials, and build-number
auto-increment. It is for an App Store Connect/TestFlight build, not ad-hoc distribution:

    pnpm --dir projects/health-exporter/apps/mobile exec eas build --platform ios --profile internal-testflight

That command is documentation only: this change does not build, upload, submit, deploy, or touch App
Store Connect. A signed build requires the EAS CLI/account, registered bundle ID, EAS project,
Apple team, credentials, and HealthKit capability enabled for that App ID.

## Manual device check

1. Install a signed TestFlight build on a physical iPhone; HealthKit is unavailable in this Linux
   workspace and should be validated on-device.
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
- This workspace has no eas or xcodebuild; no Expo token, Apple team ID, or App Store Connect
  credential variables were present. Expo local state exists, but its session-secret presence check
  was false; no state contents were printed. Bundle ID, Apple team, and EAS project ID remain
  intentionally required inputs.
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

A push to main triggers `.github/workflows/deploy.yml`. Keep this implementation local until
deployment is explicitly approved; do not push merely to save progress. No automatic mobile
deploy is enabled. A signed EAS build alone does not upload to TestFlight: after app identity,
App Store Connect app, signing, and privacy/export-compliance setup, separately approve upload of
the exact build artifact and restrict testing to the internal group. No public review/release.

Remaining prerequisites: active Apple Developer membership/team, registered bundle ID with HealthKit,
EAS login/project and signing credentials, App Store Connect app record/internal tester group,
approved HTTPS backend plus D1 migration and HEALTH_EXPORTER_SECRET. Remote credentials were not
queried without a login. `EXPO_TOKEN` is a secret if automation is later enabled; bundle ID, team ID,
and EAS project ID are nonsecret identifiers. Apple signing/ASC keys remain secrets. Do not add
health payloads or the personal ingestion secret to EXPO_PUBLIC or source control.
