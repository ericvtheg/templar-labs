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

Runs are serialized per project. Rerunning creates a new build with a new build
number; it never submits whichever build happens to be latest. Before rerunning
after a timeout, check EAS for a build still running remotely.

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
