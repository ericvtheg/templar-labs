import { fileURLToPath } from "node:url";
import process from "node:process";
import { checkPackageJsonScripts } from "./checks/package-json-scripts.ts";
import { createWorkspaceContext, type WorkspaceContext } from "./workspace.ts";

type WorkspaceCheck = (context: WorkspaceContext) => string[] | Promise<string[]>;

const workspaceChecks: WorkspaceCheck[] = [
  checkPackageJsonScripts,
];

export async function checkWorkspace(rootDir = process.cwd()): Promise<string[]> {
  const context = await createWorkspaceContext(rootDir);
  const failures = await Promise.all(
    workspaceChecks.map(async (workspaceCheck) => workspaceCheck(context)),
  );

  return failures.flat();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await checkWorkspace();

  if (failures.length > 0) {
    console.error("Workspace package convention check failed:\n");

    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
  } else {
    console.log("Workspace package convention check passed.");
  }
}
