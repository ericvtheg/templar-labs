import type { MonorepoContext, MonorepoPackage } from "../monorepo.ts";

const requiredScripts = ["build", "check", "lint", "test", "typecheck"] as const;

function checkPackage(workspacePackage: MonorepoPackage): string[] {
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

export function checkPackageJsonScripts(context: MonorepoContext): string[] {
  return context.packages.flatMap(checkPackage);
}
