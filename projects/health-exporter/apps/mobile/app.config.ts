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
  const bundleIdentifier = required(
    "HEALTH_EXPORTER_BUNDLE_ID",
    /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/,
  );
  const appleTeamId = required("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/);
  const projectId = required(
    "EAS_PROJECT_ID",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  return {
    ...config,
    name: "Personal Health Exporter",
    slug: "personal-health-exporter",
    version: "0.1.0",
    orientation: "portrait",
    ios: {
      bundleIdentifier,
      appleTeamId,
      supportsTablet: false,
      infoPlist: {
        NSHealthShareUsageDescription: "Read your recent step-count samples when you tap Sync.",
      },
      entitlements: {
        "com.apple.developer.healthkit": true,
      },
    },
    plugins: ["expo-secure-store"],
    extra: { eas: { projectId } },
  };
};
