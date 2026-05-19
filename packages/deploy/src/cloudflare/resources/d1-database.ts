import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { D1DatabaseProps } from "alchemy/cloudflare";
import { D1Database } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type D1DatabaseOptions = Omit<D1DatabaseProps, "name"> &
  Omit<ResourceNameInput, "resource"> & {
    /**
     * Multiple migration sources to compose into one generated Alchemy-compatible
     * migration directory. Use this when package-owned tables share a database
     * with app-owned tables.
     */
    migrationsDirs?: readonly string[];
    name?: string;
  };

export async function d1Database(id: string, options: D1DatabaseOptions) {
  const { project, qualifier, name, migrationsDirs, ...props } = options;
  const migrationsDir = await resolveMigrationsDir(id, props.migrationsDir, migrationsDirs);

  return await D1Database(id, {
    ...props,
    ...(migrationsDir === undefined ? {} : { migrationsDir }),
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}

async function resolveMigrationsDir(
  id: string,
  migrationsDir: string | undefined,
  migrationsDirs: readonly string[] | undefined,
) {
  if (migrationsDir !== undefined && migrationsDirs !== undefined) {
    throw new Error(`d1Database("${id}") cannot set both migrationsDir and migrationsDirs.`);
  }

  if (migrationsDirs === undefined) {
    return migrationsDir;
  }

  return await composeMigrationsDir(id, migrationsDirs);
}

async function composeMigrationsDir(id: string, migrationsDirs: readonly string[]) {
  const targetDir = path.join(".templar", "d1-migrations", id);
  const manifest: Array<{ readonly from: string; readonly to: string }> = [];
  const seen = new Map<string, string>();

  await rm(targetDir, { force: true, recursive: true });
  await mkdir(targetDir, { recursive: true });

  for (const migrationsDir of migrationsDirs) {
    const sqlFiles = await listSqlFiles(migrationsDir);

    for (const relativeFile of sqlFiles) {
      const existing = seen.get(relativeFile);

      if (existing !== undefined) {
        throw new Error(
          `Duplicate D1 migration filename "${relativeFile}" from ${migrationsDir}; already provided by ${existing}.`,
        );
      }

      seen.set(relativeFile, migrationsDir);

      const targetFile = path.join(targetDir, relativeFile);
      await mkdir(path.dirname(targetFile), { recursive: true });
      await copyFile(path.join(migrationsDir, relativeFile), targetFile);
      manifest.push({ from: path.join(migrationsDir, relativeFile), to: relativeFile });
    }
  }

  await writeFile(
    path.join(targetDir, "manifest.json"),
    `${JSON.stringify({ migrationsDirs, files: manifest }, null, 2)}\n`,
  );

  return targetDir;
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return (await listSqlFiles(entryPath)).map((file) => path.join(entry.name, file));
      }

      if (!entry.name.endsWith(".sql")) {
        return [];
      }

      return [entry.name];
    }),
  );

  return files.flat().toSorted();
}
