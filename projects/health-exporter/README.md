# Health Exporter by Breli

An iPhone app that reads authorized Apple Health data and pushes it to a configured HTTPS destination. This repository owns the mobile app and upload format only.

The personal receiver is maintained in [ericvtheg/homelab](https://github.com/ericvtheg/homelab/tree/main/stacks/health-exporter). It receives uploads at `https://health-export.ericventor.com`. Server code, databases, migrations, container deployment, and tunnel configuration belong there.

## Use

Enter the destination URL and the personal secret saved in Proton Pass. The app stores these settings securely on the phone. Version 0.2 exports all accessible history across supported HealthKit types, with no date window or total record cap. Keep the app open, tap Export / resume, and grant the read permissions you want. Progress is saved after acknowledged batches. Use Export from beginning after granting additional permissions or to re-read history.

The destination implements `/api/v2/health-archive`. See [upload contract](docs/upload-contract.md). The app can use any destination implementing that contract. V1 remains documented for older TestFlight builds.

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

## Verify

```sh
pnpm --filter health-exporter check
pnpm check:monorepo
```

Mobile builds run through the shared GitHub Actions workflow and submit to TestFlight. Unchanged app source reuses or skips an existing build to conserve the Expo quota. This project does not deploy a server from Templar Labs.

Keep the personal upload secret out of source, logs, and EAS build variables. Existing Cloudflare resources and their data are not deleted by moving the receiver source.

## Export coverage

The catalog covers 120 quantity types and all nondeprecated category identifiers in the iOS 26.5 SDK, filtered by the phone's OS version. It also includes workouts, correlations, activity summaries, personal characteristics, audiograms, ECGs, heartbeat series, workout routes, vision prescriptions, mood, scored assessments, clinical records/documents, and iOS 26 medication records.

Quantities and categories have readable JSON fields. Specialized samples preserve SDK-encoded fields as base64 Apple secure archives; ECG voltages, route locations, heartbeat timing, quantity series, and FHIR payloads are exported separately in chunks. Archive fragments retain parent IDs and part counts for reconstruction. These archives are not Apple's Health XML format and require Apple APIs to decode specialized fields.

The app requests read-only access. Availability and permissions determine which records Apple returns; an empty result cannot distinguish no data from denied access. Clinical records require Health Records signing capability. Per-object types may prompt separately. A failed type is reported as a partial export and its checkpoint does not advance.

The initial bulk export runs fastest in the foreground. Version 0.3 adds automatic updates as described below. It does not claim a complete copy of Apple's private database, Medical ID, inaccessible attachments, or fields HealthKit does not expose. Source samples retain their original granularity and provenance.

Version 0.5 also exports HealthKit's merged daily activity statistics and minute workout timelines. These let the receiver answer routine questions without adding overlapping Watch/phone samples. The original records remain available for inspection. Derived exports have independent checkpoints, refresh recent and corrected intervals, and periodically rebuild history. Existing raw imports resume without a reset. See the [derived upload format](docs/upload-contract.md#derived-records).

## Automatic updates

Automatic updates default to on when the destination is first configured by starting an export. The switch can disable them at any time while no manual operation is running. Enabling the switch directly also configures the saved destination and requests HealthKit access.

- A native app-delegate subscriber installs HealthKit observers during launch, before JavaScript starts
- New/deleted samples enqueue their type for an anchored upload; fresh changes take priority over reconciliation
- An iOS `BGProcessingTask` retries queued work and periodically reconciles types without observer support, including snapshots
- Destination credentials are stored in the device-only Keychain, accessible after the first unlock; health payloads are not persisted in preferences or logs
- Manual exports acquire a native foreground lease, cancel and await automatic work, then release the lease when finished
- Expiration cancels HealthKit queries and network requests, completes iOS callbacks, and retains unacknowledged progress
- Checkpoints advance only after uploads are acknowledged; per-type generation counters retain notifications that arrive during an upload

iOS decides when background work runs. Locked Health data, connectivity, Background App Refresh settings, and force-quitting can defer it. Open the app after force-quitting to resume. The UI shows the last automatic check and retry status. Types requiring an interactive document permission prompt remain queued for a foreground export.

The receiver remains entirely in the homelab repository. Version 0.5 extends the v2 contract with coverage and derived records; deploy the matching receiver update before installing this version.

Version 0.4 reads quantity/category history in 250-sample pages and other sample types in 10-sample pages. Uploads retain the 100-record and size limits; the last batch includes the checkpoint, avoiding a separate request. A typical 250 samples with two records each needs five uploads instead of twenty.

Automatic work rotates after four pages per type, then continues another round while execution time remains. Scheduled processing runs until iOS expires it, the phone locks, or the queue is exhausted; it has no fixed 16-second cap. Short background sessions stop before their UIKit allowance expires. Pending scheduled tasks are preserved rather than postponed by repeated submissions. Manual exports pause on backgrounding and hand off to automatic work when enabled; a short native assertion protects that handoff.

### Device verification

1. Install the new TestFlight build, run the first export, and leave Automatic updates on
2. Background the app without force-quitting, record a new Health sample, and allow iOS to deliver the update
3. Check that the homelab receives the new record and the app shows a later automatic check
4. Repeat with the destination temporarily unavailable; restoring connectivity should allow a later retry without duplicate records
5. Disable Automatic updates and confirm new automatic uploads stop

Native upload/cancellation/queue tests run on macOS; the iOS integration is typechecked against Apple's SDK and compiled in EAS. Actual background delivery timing requires physical-device validation.
