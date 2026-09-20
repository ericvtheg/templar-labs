import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { parseAllDocuments } from "yaml";
import { releaseIdentity } from "./config.ts";

type Entry = { version: string };
type Importer = {
  dependencies?: Record<string, Entry>;
  devDependencies?: Record<string, Entry>;
  optionalDependencies?: Record<string, Entry>;
};
type Snapshot = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
type Lockfile = {
  importers: Record<string, Importer>;
  snapshots: Record<string, Snapshot>;
  packages: Record<string, unknown>;
  patchedDependencies?: Record<string, { path: string }>;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sourceFingerprint(
  root: string,
  project: string,
  env: NodeJS.ProcessEnv,
  ref = "HEAD",
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) {
    throw new Error("Invalid project directory.");
  }
  if (ref !== "HEAD" && !/^[0-9a-f]{40}$/.test(ref)) {
    throw new Error("Invalid source commit.");
  }
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const read = (path: string) => git("show", `${ref}:${path}`);
  const app = `projects/${project}/apps/mobile`;
  // pnpm 11 can put toolchain and workspace lockfiles in separate YAML documents.
  const documents = parseAllDocuments(read("pnpm-lock.yaml"));
  for (const document of documents) {
    if (document.errors.length > 0) {
      throw new Error("Cannot parse the dependency lockfile.");
    }
  }
  const lock = documents
    .map((document) => document.toJS() as Lockfile)
    .find((document) => document?.importers?.[app]);
  if (!lock) {
    throw new Error(`No locked mobile workspace for ${project}.`);
  }
  const roots = new Set<string>();
  const dependencies: Record<string, unknown> = {};

  function addPackage(name: string, version: string) {
    const key = lock?.snapshots[`${name}@${version}`] ? `${name}@${version}` : version;
    if (key in dependencies) {
      return;
    }
    const snapshot = lock?.snapshots[key];
    if (!snapshot) {
      throw new Error(`Cannot fingerprint locked dependency ${name}.`);
    }
    dependencies[key] = { snapshot, package: lock?.packages[key.split("(")[0] ?? key] };
    for (const [child, resolved] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    })) {
      addPackage(child, resolved);
    }
  }

  function addWorkspace(path: string) {
    if (path.startsWith("../") || posix.isAbsolute(path)) {
      throw new Error("Dependency is outside the repository.");
    }
    if (roots.has(path)) {
      return;
    }
    roots.add(path);
    const importer = lock?.importers[path];
    if (!importer) {
      throw new Error(`Missing workspace importer ${path}.`);
    }
    dependencies[`workspace:${path}`] = importer;
    for (const [name, entry] of Object.entries({
      ...importer.dependencies,
      ...importer.devDependencies,
      ...importer.optionalDependencies,
    })) {
      if (entry.version.startsWith("link:")) {
        addWorkspace(posix.normalize(posix.join(path, entry.version.slice(5))));
      } else {
        addPackage(name, entry.version);
      }
    }
  }
  addWorkspace(app);

  const rootPackage = JSON.parse(read("package.json"));
  const identity = releaseIdentity(env);
  const hash = createHash("sha256");
  hash.update(
    canonical({
      version: 1,
      buildEnv: identity.buildEnv,
      ascAppId: identity.iosSubmit.ascAppId,
      dependencies,
      toolchain: {
        packageManager: rootPackage.packageManager,
        engines: rootPackage.engines,
        devEngines: rootPackage.devEngines,
        pnpm: rootPackage.pnpm,
      },
    }),
  );
  const rootFiles = new Set([
    ".nvmrc",
    ".npmrc",
    "pnpm-workspace.yaml",
    ".easignore",
    ".gitignore",
  ]);
  for (const patch of Object.values(lock.patchedDependencies ?? {})) {
    rootFiles.add(patch.path);
  }
  for (const entry of git("ls-tree", "-rz", ref).split("\0").filter(Boolean)) {
    const [metadata, path] = entry.split("\t");
    if (!path || !metadata) {
      continue;
    }
    const owned = [...roots].some((directory) => path.startsWith(`${directory}/`));
    const isTestOrDoc =
      /(?:^|\/)(?:test|tests|__tests__|docs)\//.test(path) ||
      /(?:\.test\.[^/]+|\.spec\.[^/]+|\.md)$/.test(path);
    if (rootFiles.has(path) || (owned && !isTestOrDoc)) {
      // Includes file mode, blob identity, and path: edits, deletions, and renames differ.
      hash.update(`${metadata}\t${path}\0`);
    }
  }
  return hash.digest("hex");
}
