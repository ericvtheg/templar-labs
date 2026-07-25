#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { devPorts } from "../tools/dev-ports/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectsDir = path.join(rootDir, "projects");

try {
  const projects = await discoverProjects();
  const selector = process.argv.slice(2).find((argument) => !argument.startsWith("-"));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage(projects);
    process.exit(0);
  }

  if (projects.length === 0) {
    throw new Error("No projects with a dev script were found under projects/.");
  }

  if (process.argv.includes("--all") || selector === "all") {
    await runAllProjects();
    process.exit(0);
  }

  const selectedProject =
    selector === undefined ? await selectProject(projects) : findProject(projects, selector);

  if (selectedProject?.name === "all") {
    await runAllProjects();
  } else if (selectedProject !== undefined) {
    await runProject(selectedProject);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function discoverProjects() {
  if (!(await exists(projectsDir))) {
    return [];
  }

  const entries = await readdir(projectsDir, { withFileTypes: true });
  const discoveredProjects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packageJsonPath = path.join(projectsDir, entry.name, "package.json");

        if (!(await exists(packageJsonPath))) {
          return undefined;
        }

        const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

        if (packageJson.scripts?.dev === undefined) {
          return undefined;
        }

        const name = packageJson.name ?? entry.name;
        const portName = `${entry.name}-web`;

        return {
          directoryName: entry.name,
          label: packageJson.displayName ?? toTitleCase(entry.name),
          name,
          port: portName in devPorts ? devPorts[portName] : undefined,
        };
      }),
  );

  return discoveredProjects
    .filter((project) => project !== undefined)
    .toSorted((first, second) => first.label.localeCompare(second.label));
}

async function selectProject(projects) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printUsage(projects);
    throw new Error("Interactive project selection requires a terminal. Pass a project name.");
  }

  const options = [...projects, { label: "All projects", name: "all" }];
  const labelWidth = Math.max(...options.map((option) => option.label.length));
  let selectedIndex = 0;

  console.log("\nChoose a project to run (j/k or arrows, Enter to start, q to quit):\n");

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("\u001B[?25l");
  renderOptions(options, selectedIndex, labelWidth);

  const selection = await new Promise((resolve) => {
    const onKeypress = (character, key) => {
      if (key?.name === "down" || character === "j") {
        selectedIndex = (selectedIndex + 1) % options.length;
        rerenderOptions(options, selectedIndex, labelWidth);
        return;
      }

      if (key?.name === "up" || character === "k") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        rerenderOptions(options, selectedIndex, labelWidth);
        return;
      }

      if (key?.name === "return") {
        resolve(options[selectedIndex]);
        return;
      }

      if (key?.ctrl && key.name === "c") {
        process.exitCode = 130;
        resolve(undefined);
        return;
      }

      if (key?.name === "escape" || character === "q") {
        resolve(undefined);
      }
    };

    process.stdin.on("keypress", onKeypress);
  });

  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.removeAllListeners("keypress");
  process.stdout.write("\u001B[?25h\n");

  return selection;
}

function findProject(projects, selector) {
  const normalizedSelector = normalize(selector);
  const exactMatch = projects.find((project) => {
    return [project.name, project.directoryName, project.label].some(
      (value) => normalize(value) === normalizedSelector,
    );
  });

  if (exactMatch !== undefined) {
    return exactMatch;
  }

  const partialMatches = projects.filter((project) => {
    return [project.name, project.directoryName, project.label].some((value) =>
      normalize(value).includes(normalizedSelector),
    );
  });

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `"${selector}" matches multiple projects: ${partialMatches
        .map((project) => project.name)
        .join(", ")}`,
    );
  }

  throw new Error(`No runnable project matches "${selector}". Run pnpm dev to choose one.`);
}

function renderOptions(options, selectedIndex, labelWidth) {
  for (const [index, option] of options.entries()) {
    const marker = index === selectedIndex ? "\u001B[36m❯\u001B[0m" : " ";
    const port = option.port === undefined ? "" : `localhost:${option.port}`;
    console.log(`${marker} ${option.label.padEnd(labelWidth)}  \u001B[2m${port}\u001B[0m`);
  }
}

function rerenderOptions(options, selectedIndex, labelWidth) {
  process.stdout.write(`\u001B[${options.length}A`);

  for (const [index, option] of options.entries()) {
    process.stdout.write("\u001B[2K");
    const marker = index === selectedIndex ? "\u001B[36m❯\u001B[0m" : " ";
    const port = option.port === undefined ? "" : `localhost:${option.port}`;
    process.stdout.write(
      `${marker} ${option.label.padEnd(labelWidth)}  \u001B[2m${port}\u001B[0m\n`,
    );
  }
}

async function runProject(project) {
  console.log(
    `Starting ${project.label}${project.port === undefined ? "" : ` on localhost:${project.port}`}...`,
  );
  await run("pnpm", ["--filter", project.name, "dev"]);
}

async function runAllProjects() {
  console.log("Starting all projects...");
  await run("pnpm", ["run", "dev:all"]);
}

async function run(command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell: false,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
  }
}

function printUsage(projects) {
  console.log(`Usage:
  pnpm dev                 Pick a project interactively
  pnpm dev <name>          Run one project (partial names work)
  pnpm dev --all           Run every project
  pnpm dev --help          Show this help

Projects:
${projects.map((project) => `  ${project.name}`).join("\n")}`);
}

function normalize(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function toTitleCase(value) {
  return value
    .split("-")
    .map((word) => (word === "ui" ? "UI" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
