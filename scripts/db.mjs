#!/usr/bin/env node

import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectsDir = path.join(rootDir, "projects");
const configNames = ["db.config.mjs", "db.config.js", "db.config.ts"];
const providers = new Set(["d1", "postgres", "libsql"]);

const command = process.argv[2];
const args = process.argv.slice(3);

try {
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command === undefined ? 1 : 0);
  }

  const projectName = args.find((arg) => !arg.startsWith("-"));
  const allProjects = args.includes("--all");

  if (!allProjects && projectName === undefined) {
    console.error("Missing project name.");
    printUsage();
    process.exit(1);
  }

  const mode = args.includes("--prod") || args.includes("--remote") ? "prod" : "local";
  const projectConfigs = allProjects
    ? await loadAllProjectDbConfigs()
    : await loadProjectDbConfigs(projectName, path.join(projectsDir, projectName));

  if (projectConfigs.length === 0) {
    console.log("No project database configs found. Nothing to do.");
    process.exit(0);
  }

  switch (command) {
    case "generate":
      await Promise.all(projectConfigs.map((projectConfig) => generate(projectConfig)));
      break;
    case "migrate":
      await Promise.all(projectConfigs.map((projectConfig) => migrate(projectConfig, mode)));
      break;
    default:
      console.error(`Unknown db command: ${command}`);
      printUsage();
      process.exit(1);
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }

  throw error;
}

async function generate(projectConfig) {
  console.log(`Generating database migrations for ${projectConfig.label}...`);

  await run("pnpm", ["exec", "drizzle-kit", "generate", "--config", projectConfig.drizzleConfig], {
    cwd: projectConfig.projectDir,
  });
}

async function migrate(projectConfig, mode) {
  console.log(`Applying ${mode} database migrations for ${projectConfig.label}...`);

  switch (projectConfig.provider) {
    case "d1":
      await migrateD1(projectConfig, mode);
      return;
    case "postgres":
    case "libsql":
      await run(
        "pnpm",
        ["exec", "drizzle-kit", "migrate", "--config", projectConfig.drizzleConfig],
        {
          cwd: projectConfig.projectDir,
        },
      );
      return;
    default:
      throw new Error(`Unsupported db provider: ${projectConfig.provider}`);
  }
}

async function migrateD1(projectConfig, mode) {
  if (projectConfig.databaseName === undefined) {
    throw new Error(`${projectConfig.configPath} must set databaseName for provider "d1".`);
  }

  if (projectConfig.wranglerConfig === undefined) {
    console.log(
      `Skipping Wrangler D1 migrations for ${projectConfig.label}; no wranglerConfig was set. ` +
        "Deploy-time infrastructure may apply this database's migrations.",
    );
    return;
  }

  const remoteFlag = mode === "prod" ? "--remote" : "--local";

  await run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      projectConfig.databaseName,
      remoteFlag,
      "--config",
      projectConfig.wranglerConfig,
    ],
    {
      cwd: projectConfig.projectDir,
    },
  );
}

async function loadProjectDbConfigs(projectName, projectDir) {
  await assertDirectory(projectDir, `Unknown project: ${projectName}`);

  const configs = await findProjectDbConfigs(projectName, projectDir);

  if (configs.length > 0) {
    return configs;
  }

  const availableFiles = await readdir(projectDir);
  const hint = availableFiles.length === 0 ? "" : ` Found: ${availableFiles.join(", ")}`;

  throw new Error(
    `Missing database config. Add one of ${configNames.join(
      ", ",
    )} under ${projectDir}/db for the project database.${hint}`,
  );
}

async function loadAllProjectDbConfigs() {
  await assertDirectory(projectsDir, "No projects directory found.");

  const projectEntries = await readdir(projectsDir, { withFileTypes: true });
  const projectConfigs = await Promise.all(
    projectEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        return await findProjectDbConfigs(entry.name, path.join(projectsDir, entry.name));
      }),
  );

  return projectConfigs.flat().toSorted((a, b) => a.label.localeCompare(b.label));
}

async function findProjectDbConfigs(projectName, projectDir) {
  const sharedConfigPath = await findProjectLevelDbConfig(projectDir);
  const appConfigs = await findAppDbConfigs(projectName, projectDir);

  if (sharedConfigPath !== undefined && appConfigs.length > 0) {
    throw new Error(
      `Project ${projectName} has both project-level and app-level database configs. ` +
        "Keep the source-of-truth database config at the project level.",
    );
  }

  if (sharedConfigPath !== undefined) {
    return [
      await loadDbConfigFromPath({
        projectName,
        configDir: path.dirname(sharedConfigPath),
        configPath: sharedConfigPath,
      }),
    ];
  }

  if (appConfigs.length > 0) {
    return appConfigs;
  }

  return [];
}

async function findProjectLevelDbConfig(projectDir) {
  const configPaths = [
    ...configNames.map((configName) => path.join(projectDir, configName)),
    ...configNames.map((configName) => path.join(projectDir, "db", configName)),
  ];
  const existenceResults = await Promise.all(configPaths.map((configPath) => exists(configPath)));
  const existingConfigPaths = configPaths.filter((_, index) => existenceResults[index] === true);

  if (existingConfigPaths.length > 1) {
    throw new Error(
      `Multiple project-level database configs found:\n${existingConfigPaths.join("\n")}`,
    );
  }

  return existingConfigPaths[0];
}

async function findAppDbConfigs(projectName, projectDir) {
  const appsDir = path.join(projectDir, "apps");

  if (!(await exists(appsDir))) {
    return [];
  }

  const appEntries = await readdir(appsDir, { withFileTypes: true });
  const appConfigs = await Promise.all(
    appEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const appDir = path.join(appsDir, entry.name);
        const configPath = await findOptionalConfigPath(appDir);

        if (configPath === undefined) {
          return undefined;
        }

        return await loadDbConfigFromPath({
          appName: entry.name,
          projectName,
          configDir: appDir,
          configPath,
        });
      }),
  );

  return appConfigs
    .filter((appConfig) => appConfig !== undefined)
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

async function loadDbConfigFromPath({ appName, projectName, configDir, configPath }) {
  const imported = await import(pathToFileURL(configPath).href);
  const config = imported.default ?? imported;

  if (typeof config !== "object" || config === null) {
    throw new Error(`${configPath} must export a config object.`);
  }

  if (!providers.has(config.provider)) {
    throw new Error(
      `${configPath} must set provider to one of: ${Array.from(providers).join(", ")}.`,
    );
  }

  const drizzleConfig = config.drizzleConfig ?? "drizzle.config.ts";
  const drizzleConfigPath = path.resolve(configDir, drizzleConfig);
  await assertFile(drizzleConfigPath, `${configPath} references missing ${drizzleConfig}.`);

  const wranglerConfig =
    config.wranglerConfig === undefined ? undefined : String(config.wranglerConfig);

  if (wranglerConfig !== undefined) {
    await assertFile(
      path.resolve(configDir, wranglerConfig),
      `${configPath} references missing ${wranglerConfig}.`,
    );
  }

  const label = appName === undefined ? projectName : `${projectName}/${appName}`;

  return {
    appName,
    configPath,
    databaseName: config.databaseName,
    drizzleConfig,
    label,
    projectDir: configDir,
    projectName,
    provider: config.provider,
    wranglerConfig,
  };
}

async function findOptionalConfigPath(projectDir) {
  const configPaths = configNames.map((configName) => path.join(projectDir, configName));
  const existenceResults = await Promise.all(configPaths.map((configPath) => exists(configPath)));
  const configPath = configPaths.find((_, index) => existenceResults[index] === true);

  return configPath;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertDirectory(directoryPath, message) {
  if (!(await exists(directoryPath))) {
    throw new Error(message);
  }
}

async function assertFile(filePath, message) {
  if (!(await exists(filePath))) {
    throw new Error(message);
  }
}

async function run(commandName, commandArgs, options = {}) {
  const child = spawn(commandName, commandArgs, {
    cwd: options.cwd ?? rootDir,
    shell: false,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`${commandName} ${commandArgs.join(" ")} exited with code ${exitCode}.`);
  }
}

function printUsage() {
  console.log(`Usage:
  pnpm db:generate <project>
  pnpm db:generate --all
  pnpm db:migrate:local <project>
  pnpm db:migrate:prod <project>
  pnpm db:migrate:ci

Project config:
  projects/<project>/db/db.config.mjs

Example:
  export default {
    provider: "d1",
    databaseName: "my-project",
    drizzleConfig: "drizzle.config.ts",
    wranglerConfig: "wrangler.jsonc", // optional; otherwise D1 migrations are deploy-managed
  };
`);
}
