import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkPackageJsonScripts } from "./checks/package-json-scripts.ts";
import { checkPackageNames } from "./checks/package-names.ts";
import { checkPackagePrivacy } from "./checks/package-privacy.ts";
import { checkProjectAppDeployScripts } from "./checks/project-app-deploy-scripts.ts";
import { createMonorepoContext, type MonorepoContext } from "./monorepo.ts";

type MonorepoCheck = (context: MonorepoContext) => string[] | Promise<string[]>;

const monorepoChecks: MonorepoCheck[] = [
  checkPackageJsonScripts,
  checkPackageNames,
  checkPackagePrivacy,
  checkProjectAppDeployScripts,
];

export async function checkMonorepo(rootDir = process.cwd()): Promise<string[]> {
  const context = await createMonorepoContext(rootDir);
  const failures = await Promise.all(
    monorepoChecks.map(async (monorepoCheck) => monorepoCheck(context)),
  );

  return failures.flat();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await checkMonorepo();

  if (failures.length > 0) {
    console.error("Monorepo package convention check failed:\n");

    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
  } else {
    console.log("Monorepo package convention check passed.");
  }
}
