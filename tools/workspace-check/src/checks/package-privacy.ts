import type { WorkspaceContext, WorkspacePackage } from "../workspace.ts";

function checkPackage(workspacePackage: WorkspacePackage): string[] {
  if (workspacePackage.packageJson.private === true) {
    return [];
  }

  return [`${workspacePackage.packageJsonPath} must set private: true`];
}

export function checkPackagePrivacy(context: WorkspaceContext): string[] {
  return context.packages.flatMap(checkPackage);
}
