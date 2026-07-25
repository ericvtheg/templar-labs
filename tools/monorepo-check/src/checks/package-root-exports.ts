import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MonorepoContext, MonorepoPackage } from "../monorepo.ts";

const wildcardExportPattern = /^\s*export\s+(?:type\s+)?\*\s+from\s+/m;

async function checkPackage(
  context: MonorepoContext,
  workspacePackage: MonorepoPackage,
): Promise<string[]> {
  const pathParts = workspacePackage.packageJsonPath.split(path.posix.sep);

  if (pathParts[0] !== "packages") {
    return [];
  }

  const indexPath = path.posix.join(
    path.posix.dirname(workspacePackage.packageJsonPath),
    "src/index.ts",
  );

  try {
    const source = await readFile(path.join(context.rootDir, indexPath), "utf8");

    return wildcardExportPattern.test(source)
      ? [`${indexPath} must use an explicit root export allowlist instead of export *`]
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function checkPackageRootExports(context: MonorepoContext): Promise<string[]> {
  const failures = await Promise.all(
    context.packages.map((workspacePackage) => checkPackage(context, workspacePackage)),
  );

  return failures.flat();
}
