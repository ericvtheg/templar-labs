import path from "node:path";
import type { MonorepoContext, MonorepoPackage } from "../monorepo.ts";

function isProjectApp(workspacePackage: MonorepoPackage): boolean {
  const pathParts = workspacePackage.packageJsonPath.split(path.posix.sep);
  const [workspaceGroup, , appsFolder, , fileName] = pathParts;

  return workspaceGroup === "projects" && appsFolder === "apps" && fileName === "package.json";
}

function checkPackage(workspacePackage: MonorepoPackage): string[] {
  if (!isProjectApp(workspacePackage)) {
    return [];
  }

  const { packageJson } = workspacePackage;
  const packageName = packageJson.name ?? workspacePackage.packageJsonPath;
  const deployScript = packageJson.scripts?.deploy;

  if (deployScript === undefined || deployScript.trim() === "") {
    return [`${packageName} is missing scripts.deploy`];
  }

  return [];
}

export function checkProjectAppDeployScripts(context: MonorepoContext): string[] {
  return context.packages.flatMap(checkPackage);
}
