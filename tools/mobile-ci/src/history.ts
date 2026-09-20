// oxlint-disable no-await-in-loop -- Each history page depends on whether the previous page contains a matching build.
import { profileName, releaseIdentity } from "./config.ts";
import { sourceFingerprint } from "./fingerprint.ts";

export type Build = {
  id: string;
  status: string;
  platform: string;
  buildProfile: string;
  appIdentifier: string;
  gitCommitHash: string | null;
  message: string | null;
  submissions: { status: string; iosConfig: { ascAppIdentifier: string } | null }[];
};

export type Decision = {
  action: "build" | "skip" | "submit";
  fingerprint: string;
  buildId?: string;
};
export const sourceMessage = (fingerprint: string) => `templar-source-v1:${fingerprint}`;

export function decideBuild(build: Build, fingerprint: string, ascAppId: string): Decision {
  if (build.status !== "FINISHED") {
    throw new Error(
      `Source is unchanged and EAS build ${build.id} is ${build.status}. No new build started. Inspect that build before retrying.`,
    );
  }
  const submissions = build.submissions.filter(
    (submission) => submission.iosConfig?.ascAppIdentifier === ascAppId,
  );
  if (submissions.some((submission) => submission.status === "FINISHED")) {
    return { action: "skip", fingerprint, buildId: build.id };
  }
  if (
    submissions.some((submission) =>
      ["AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS"].includes(submission.status),
    )
  ) {
    throw new Error(
      `TestFlight submission for build ${build.id} is still running. No duplicate build or submission started.`,
    );
  }
  return { action: "submit", fingerprint, buildId: build.id };
}

export async function planRelease(
  root: string,
  project: string,
  env: NodeJS.ProcessEnv,
): Promise<Decision> {
  const identity = releaseIdentity(env);
  const fingerprint = sourceFingerprint(root, project, env);
  const { EXPO_TOKEN: token } = env;
  if (!token) {
    throw new Error("Missing EXPO_TOKEN.");
  }
  for (let offset = 0; ; offset += 50) {
    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "templar-mobile-ci",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        query: `query($id: String!, $offset: Int!) {
          app { byId(appId: $id) { builds(limit: 50, offset: $offset) {
            id status platform buildProfile appIdentifier gitCommitHash message
            submissions { status iosConfig { ascAppIdentifier } }
          } } }
        }`,
        variables: { id: identity.buildEnv.EAS_PROJECT_ID, offset },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `EAS history request failed (${response.status}); refusing to spend a build without checking history.`,
      );
    }
    const result = (await response.json()) as {
      errors?: unknown[];
      data?: { app?: { byId?: { builds?: Build[] } } };
    };
    const builds = result.data?.app?.byId?.builds;
    if (result.errors?.length || !Array.isArray(builds)) {
      throw new Error("Cannot read EAS build history; no build started.");
    }
    for (const build of builds) {
      if (
        build.platform !== "IOS" ||
        build.buildProfile !== profileName ||
        build.appIdentifier !== identity.buildEnv.IOS_BUNDLE_ID
      ) {
        continue;
      }
      let matches = build.message === sourceMessage(fingerprint);
      // Adopt builds from the earlier workflow, before source messages were recorded.
      if (!build.message && build.gitCommitHash) {
        try {
          matches = sourceFingerprint(root, project, env, build.gitCommitHash) === fingerprint;
        } catch {
          throw new Error(
            `Cannot compare legacy build ${build.id} with commit ${build.gitCommitHash}; no build started.`,
          );
        }
      }
      if (matches) {
        return decideBuild(build, fingerprint, identity.iosSubmit.ascAppId);
      }
    }
    if (builds.length < 50) {
      return { action: "build", fingerprint };
    }
  }
}
