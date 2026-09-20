import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const profileName = "internal-testflight";

export function mobileDirectory(root: string, project: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) {
    throw new Error("Project must be a directory name such as health-exporter.");
  }
  const directory = resolve(root, "projects", project, "apps", "mobile");
  if (realpathSync(directory) !== directory) {
    throw new Error("Mobile app directories must not be symlinks.");
  }
  return directory;
}

export function releaseIdentity(env: NodeJS.ProcessEnv) {
  function required(name: string, pattern: RegExp): string {
    const value = env[name];
    if (value === undefined || !pattern.test(value)) {
      throw new Error(`Missing or invalid ${name} in the mobile project's GitHub environment.`);
    }
    return value;
  }
  const buildEnv = {
    IOS_BUNDLE_ID: required("IOS_BUNDLE_ID", /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
    APPLE_TEAM_ID: required("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/),
    EAS_PROJECT_ID: required("EAS_PROJECT_ID", uuid),
    EXPO_OWNER: required("EXPO_OWNER", /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  };
  const iosSubmit = {
    ascAppId: required("ASC_APP_ID", /^\d+$/),
    appleId: required("APPLE_ID", /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    appleTeamId: buildEnv.APPLE_TEAM_ID,
  };
  return { buildEnv, iosSubmit };
}

// Write only allowlisted, nonsecret identity values into the EAS upload. Profile env
// reaches both local config evaluation and the remote builder; GitHub env alone does not.
export function prepareRelease(root: string, project: string, env: NodeJS.ProcessEnv) {
  const directory = mobileDirectory(root, project);
  const { buildEnv, iosSubmit } = releaseIdentity(env);
  const file = join(directory, "eas.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  const profile = config.build?.[profileName];
  if (profile?.distribution !== "store" || profile.credentialsSource !== "remote") {
    throw new Error(
      `eas.json must define ${profileName} with store distribution and remote credentials.`,
    );
  }
  profile.env = { ...profile.env, ...buildEnv };
  config.submit = { ...config.submit, [profileName]: { ios: iosSubmit } };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return directory;
}

export function completedBuildId(output: string): string {
  const builds = JSON.parse(output);
  if (
    !Array.isArray(builds) ||
    builds.length !== 1 ||
    builds[0]?.platform !== "IOS" ||
    builds[0]?.status !== "FINISHED" ||
    typeof builds[0]?.id !== "string" ||
    !uuid.test(builds[0].id)
  ) {
    throw new Error("Expected exactly one finished iOS build from this workflow run.");
  }
  return builds[0].id;
}
