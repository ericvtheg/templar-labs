import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();

function hasWorkspaceChildren(dirname) {
  const fullPath = join(projectRoot, dirname);

  if (!existsSync(fullPath)) {
    return false;
  }

  return readdirSync(fullPath, { withFileTypes: true }).some((entry) => {
    return entry.isDirectory() && existsSync(join(fullPath, entry.name, "package.json"));
  });
}

function runBuild(filter) {
  const result = spawnSync("pnpm", ["--filter", filter, "build"], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (hasWorkspaceChildren("packages")) {
  runBuild("./packages/*");
}

if (hasWorkspaceChildren("apps")) {
  runBuild("./apps/*");
}
