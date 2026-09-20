import { appendFileSync, readFileSync } from "node:fs";
import process, { env } from "node:process";
import { completedBuildId, prepareRelease } from "./config.ts";

const [command, argument] = process.argv.slice(2);
if (command === "prepare" && argument !== undefined) {
  const requiredSecrets = ["EXPO_TOKEN", "EXPO_APPLE_APP_SPECIFIC_PASSWORD"];
  for (const name of requiredSecrets) {
    if (!env[name]) {
      throw new Error(
        `Missing ${name} secret. Add it to the repository or mobile-${argument} environment.`,
      );
    }
  }
  prepareRelease(process.cwd(), argument, env);
  console.log(`Prepared ${argument} for a CI iOS build.`);
} else if (command === "build-id" && argument !== undefined) {
  const id = completedBuildId(readFileSync(argument, "utf8"));
  const { GITHUB_OUTPUT: githubOutput } = env;
  if (githubOutput) {
    appendFileSync(githubOutput, `id=${id}\n`);
  }
  console.log(`Finished EAS build: ${id}`);
} else {
  throw new Error(
    "Usage: node tools/mobile-ci/src/index.ts prepare <project> | build-id <json-file>",
  );
}
