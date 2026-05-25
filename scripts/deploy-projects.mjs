import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, sep, join } from "node:path";

const root = process.cwd();
const projectsDir = join(root, "projects");
const args = process.argv.slice(2);
const changedSince = readOption("--changed-since");
const dryRun = args.includes("--dry-run");

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
      directoryName: entry.name,
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

const projectsToDeploy = changedSince === undefined ? projects : filterChangedProjects(projects);

if (projectsToDeploy.length === 0) {
  console.log("No changed deployable projects found. Nothing to deploy.");
  process.exit(0);
}

for (const project of projectsToDeploy) {
  console.log(`${dryRun ? "Would deploy" : "Deploying"} ${project.name}...`);

  if (dryRun) {
    continue;
  }

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

function readOption(optionName) {
  const optionIndex = args.indexOf(optionName);

  if (optionIndex === -1) {
    return undefined;
  }

  const value = args[optionIndex + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function filterChangedProjects(allProjects) {
  const changedPaths = listChangedPaths(changedSince);

  if (changedPaths === undefined) {
    console.log("Could not determine changed paths. Deploying all projects.");
    return allProjects;
  }

  if (changedPaths.length === 0) {
    return [];
  }

  const changedProjectDirectories = new Set();

  for (const changedPath of changedPaths) {
    const normalizedPath = changedPath.split("/").join(sep);
    const relativeProjectsPath = relative(projectsDir, join(root, normalizedPath));
    const [projectDirectory] = relativeProjectsPath.split(sep);

    if (
      relativeProjectsPath.startsWith("..") ||
      relativeProjectsPath === "" ||
      !relativeProjectsPath.includes(sep) ||
      projectDirectory === undefined
    ) {
      console.log(`${changedPath} changed outside a project directory. Deploying all projects.`);
      return allProjects;
    }

    changedProjectDirectories.add(projectDirectory);
  }

  const changedProjects = allProjects.filter((project) =>
    changedProjectDirectories.has(project.directoryName),
  );

  if (changedProjects.length > 0) {
    console.log(
      `Deploying changed projects only: ${changedProjects.map((project) => project.name).join(", ")}`,
    );
  }

  return changedProjects;
}

function listChangedPaths(baseRef) {
  if (baseRef === "0000000000000000000000000000000000000000") {
    return undefined;
  }

  const result = spawnSync("git", ["diff", "--name-only", baseRef, "--", "."], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.error !== undefined || result.status !== 0) {
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    return undefined;
  }

  return result.stdout
    .split("\n")
    .map((changedPath) => changedPath.trim())
    .filter(Boolean);
}
