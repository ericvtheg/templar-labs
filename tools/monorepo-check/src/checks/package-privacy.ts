import type { MonorepoContext, MonorepoPackage } from "../monorepo.ts";

function checkPackage(workspacePackage: MonorepoPackage): string[] {
  if (workspacePackage.packageJson.private === true) {
    return [];
  }

  return [`${workspacePackage.packageJsonPath} must set private: true`];
}

export function checkPackagePrivacy(context: MonorepoContext): string[] {
  return context.packages.flatMap(checkPackage);
}
