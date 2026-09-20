# Mobile iOS CI

Run **Actions → Mobile iOS Build and TestFlight → Run workflow** on `main`.
Enter a project directory name, such as `health-exporter`. Every successful build
is uploaded to TestFlight using that run's EAS build ID. Apple processing and
tester access are managed in App Store Connect; this does not publish to the App Store.

## Add an app

1. Put the Expo workspace in `projects/<project>/apps/mobile` with a `check` script
2. Add an `internal-testflight` profile to its `eas.json` with `distribution: store`,
   `credentialsSource: remote`, `environment: production`, and iOS build-number auto-increment
3. Create a GitHub environment named `mobile-<project>` with these variables:

| Variable | Value |
| --- | --- |
| `EXPO_OWNER` | Expo account or organization owning the project |
| `EAS_PROJECT_ID` | EAS project UUID |
| `IOS_BUNDLE_ID` | Registered Apple bundle ID |
| `APPLE_TEAM_ID` | Apple Developer team ID |
| `ASC_APP_ID` | Numeric Apple app ID from App Store Connect |
| `APPLE_ID` | Apple login email for submission |

4. Add `EXPO_TOKEN` and `EXPO_APPLE_APP_SPECIFIC_PASSWORD` secrets to that environment
   or the repository. Environment secrets override shared repository credentials
5. Read the identity variables in the app's Expo config. Set its `slug` to the
   existing EAS project's slug and `owner` to `EXPO_OWNER`
6. Set up remote iOS signing once with `eas credentials --platform ios`, selecting
   `internal-testflight`, the correct Apple team, and the registered bundle ID

The first signing setup requires an Apple login with permission to manage
certificates and provisioning profiles. A GitHub token cannot replace this step.
The Apple app-specific password is for uploading, not generating signing credentials.

The workflow validates required values, runs the app's checks, and builds on EAS.
It writes only the four nonsecret build identity variables into the build profile
so they also reach the remote builder. Other app-specific variables belong in
the project's EAS `production` environment or its build profile. Never put the
personal ingestion secret into the mobile build.

## Avoid duplicate builds

Before spending a build, CI compares a SHA-256 source fingerprint with the project's
EAS build and submission history. It includes mobile source/assets/native modules,
linked workspace dependencies, their transitive locked resolutions, build config,
root toolchain settings, and the app identity. Tests, Markdown docs, backend code,
and unrelated workspaces or dependency resolutions are excluded.

- Same source already submitted: skip both build and submission
- Same source built, but upload failed or never started: submit the existing build
- Matching build or upload still running: stop without creating a duplicate
- Matching build failed or was canceled: stop; diagnose it before changing source
- Changed source: build and submit once

Runs are serialized per project. New builds record their source fingerprint in
EAS metadata; earlier untagged builds are compared using their Git commit. History
lookup failures stop the workflow rather than risk consuming a duplicate build.
Changes made only in the EAS dashboard are not part of the Git source fingerprint;
update the checked-in build profile when changing remote build inputs.

## Health Exporter

Environment: `mobile-health-exporter`

| Variable | Value |
| --- | --- |
| `EXPO_OWNER` | `ericvtheg` |
| `EAS_PROJECT_ID` | `6fca9dc5-bb3d-4bd7-a6c1-54f636050111` |
| `IOS_BUNDLE_ID` | `com.ericvtheg.healthexporter` |
| `APPLE_TEAM_ID` | `88SXCR9NGU` |
| `ASC_APP_ID` | `6814205847` |
| `APPLE_ID` | `ericventor97@gmail.com` (same Apple login as MAKID CI) |

The App Store Connect name is **Health Exporter by Breli**. The device display
name is **Health Exporter**.

Sources: [EAS CI setup](https://docs.expo.dev/build/building-on-ci/),
[iOS submission](https://docs.expo.dev/submit/ios/)
