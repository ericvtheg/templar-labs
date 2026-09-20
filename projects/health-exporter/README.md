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

This is a foreground export, not continuous background synchronization. It does not claim a complete copy of Apple's private database, Medical ID, inaccessible attachments, or fields HealthKit does not expose. Source samples are exported without aggregating overlapping records into daily totals.
