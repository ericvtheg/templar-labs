import path from "node:path";
import type { WorkspaceContext, WorkspacePackage } from "../workspace.ts";

function expectedPackageName(workspacePackage: WorkspacePackage): string | undefined {
  const pathParts = workspacePackage.packageJsonPath.split(path.posix.sep);
  const [workspaceGroup, workspaceName, fileName] = pathParts;

  if (fileName !== "package.json") {
    return undefined;
  }

  if (workspaceGroup !== "packages" && workspaceGroup !== "tools") {
    return undefined;
  }

  return `@templar/${workspaceName}`;
}

function checkPackage(workspacePackage: WorkspacePackage): string[] {
  const expectedName = expectedPackageName(workspacePackage);

  if (expectedName === undefined || workspacePackage.packageJson.name === expectedName) {
    return [];
  }

  return [`${workspacePackage.packageJsonPath} name must be ${expectedName}`];
}

export function checkPackageNames(context: WorkspaceContext): string[] {
  return context.packages.flatMap(checkPackage);
}
