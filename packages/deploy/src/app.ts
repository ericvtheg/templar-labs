import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { cwd, loadEnvFile } from "node:process";
import alchemy, { type AlchemyOptions } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";

export type DeployAppOptions = Omit<AlchemyOptions, "appName">;

export async function deployApp(appName: string, options: DeployAppOptions = {}) {
  loadWorkspaceEnvFile();

  return await alchemy(appName, {
    stateStore: (scope) => new CloudflareStateStore(scope),
    ...options,
  });
}

function loadWorkspaceEnvFile() {
  const workspaceRoot = findWorkspaceRoot(cwd());

  if (workspaceRoot === null) {
    return;
  }

  const envPath = join(workspaceRoot, ".env");

  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

function findWorkspaceRoot(startDirectory: string) {
  let directory = startDirectory;

  while (true) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
      return directory;
    }

    const parentDirectory = dirname(directory);

    if (parentDirectory === directory) {
      return null;
    }

    directory = parentDirectory;
  }
}
