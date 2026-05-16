import { access, readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { parse } from "yaml";

export type PackageJson = {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
};

type WorkspaceConfig = {
  packages?: string[];
};

export type WorkspacePackage = {
  packageJson: PackageJson;
  packageJsonPath: string;
};

export type WorkspaceContext = {
  rootDir: string;
  packages: WorkspacePackage[];
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findWorkspaceRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (await pathExists(path.join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Could not find pnpm-workspace.yaml from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readWorkspaceGlobs(rootDir: string): Promise<string[]> {
  const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
  const raw = await readFile(workspacePath, "utf8");
  const config = parse(raw) as WorkspaceConfig;

  return config.packages ?? [];
}

async function findWorkspacePackages(rootDir: string): Promise<WorkspacePackage[]> {
  const workspaceGlobs = await readWorkspaceGlobs(rootDir);
  const packageJsonGlobs = workspaceGlobs.map((workspaceGlob) =>
    path.posix.join(workspaceGlob, "package.json"),
  );
  const packageJsonPaths = await fg(["package.json", ...packageJsonGlobs], {
    cwd: rootDir,
    onlyFiles: true,
    unique: true,
  });

  return Promise.all(
    packageJsonPaths.toSorted().map(async (packageJsonPath) => ({
      packageJsonPath,
      packageJson: await readJson<PackageJson>(path.join(rootDir, packageJsonPath)),
    })),
  );
}

export async function createWorkspaceContext(startDir: string): Promise<WorkspaceContext> {
  const rootDir = await findWorkspaceRoot(startDir);
  const packages = await findWorkspacePackages(rootDir);

  return { rootDir, packages };
}
