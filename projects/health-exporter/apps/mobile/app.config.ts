import { env } from "node:process";
import type { ConfigContext, ExpoConfig } from "expo/config";

function required(name: string, pattern: RegExp): string {
  const value = env[name];
  if (value === undefined || !pattern.test(value)) {
    throw new Error(`${name} is required and must be a valid explicit project identity`);
  }
  return value;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleIdentifier = required("IOS_BUNDLE_ID", /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/);
  const appleTeamId = required("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/);
  const projectId = required(
    "EAS_PROJECT_ID",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  return {
    ...config,
    name: "Health Exporter",
    slug: "health-exporter",
    owner: required("EXPO_OWNER", /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
    version: "0.3.0",
    icon: "./assets/icon.png",
    orientation: "portrait",
    ios: {
      bundleIdentifier,
      appleTeamId,
      supportsTablet: false,
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        UIBackgroundModes: ["processing"],
        BGTaskSchedulerPermittedIdentifiers: [`${bundleIdentifier}.health-sync`],
        NSHealthClinicalHealthRecordsShareUsageDescription:
          "Export the clinical health records you select to your chosen destination for your personal archive.",
        NSHealthShareUsageDescription:
          "Read your health history, including activity, sleep, heart measurements, workouts, and other types you allow, to export to your chosen destination.",
        // Apple validates both purpose keys when the HealthKit SDK is linked.
        // The native authorization request still uses an empty toShare set.
        NSHealthUpdateUsageDescription:
          "Health Exporter reads your authorized health history for export and does not write to Apple Health.",
      },
      entitlements: {
        "com.apple.developer.healthkit.access": ["health-records"],
        "com.apple.developer.healthkit": true,
        "com.apple.developer.healthkit.background-delivery": true,
      },
    },
    plugins: ["expo-secure-store"],
    extra: { eas: { projectId } },
  };
};
