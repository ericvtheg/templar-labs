# Health Exporter by Breli

An iPhone app that reads authorized Apple Health data and pushes it to a configured HTTPS destination. This repository owns the mobile app and upload format only.

The personal receiver is maintained in [ericvtheg/homelab](https://github.com/ericvtheg/homelab/tree/main/stacks/health-exporter). It receives uploads at `https://health-export.ericventor.com`. Server code, databases, migrations, container deployment, and tunnel configuration belong there.

## Use

Enter the destination URL and the personal secret saved in Proton Pass. The app stores these settings securely on the phone. The currently released app exports the latest 100 step samples within seven days when you tap Sync; full-history, multi-type export is being expanded separately.

The receiver implements `POST /api/v1/sample-ingestion` and authenticated status at the same path. See [upload contract](docs/upload-contract.md). The app can use any destination implementing that contract.

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
