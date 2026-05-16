import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const projectsDir = join(root, "projects");

if (!existsSync(projectsDir)) {
  console.log("No projects directory found. Nothing to deploy.");
  process.exit(0);
}

const projects = readdirSync(projectsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const projectRoot = join(projectsDir, entry.name);
    const packageJsonPath = join(projectRoot, "package.json");

    if (!existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (!packageJson.scripts?.deploy) {
      return undefined;
    }

    return {
      name: packageJson.name ?? entry.name,
      root: projectRoot,
    };
  })
  .filter(Boolean)
  .toSorted((a, b) => a.name.localeCompare(b.name));

if (projects.length === 0) {
  console.log("No deployable projects found. Nothing to deploy.");
  process.exit(0);
}

for (const project of projects) {
  console.log(`Deploying ${project.name}...`);

  const result = spawnSync("pnpm", ["run", "deploy"], {
    cwd: project.root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
