import type { WorkspaceContext, WorkspacePackage } from "../workspace.ts";

const requiredScripts = ["build", "check", "lint", "test", "typecheck"] as const;

function checkPackage(workspacePackage: WorkspacePackage): string[] {
  const { packageJson, packageJsonPath } = workspacePackage;
  const packageName = packageJson.name ?? packageJsonPath;
  const scripts = packageJson.scripts ?? {};
  const failures: string[] = [];

  for (const scriptName of requiredScripts) {
    const script = scripts[scriptName];

    if (script === undefined || script.trim() === "") {
      failures.push(`${packageName} is missing scripts.${scriptName}`);
      continue;
    }

    if (script.includes("Error: no test specified")) {
      failures.push(`${packageName} has the default npm placeholder for scripts.${scriptName}`);
    }
  }

  return failures;
}

export function checkPackageJsonScripts(context: WorkspaceContext): string[] {
  return context.packages.flatMap(checkPackage);
}
