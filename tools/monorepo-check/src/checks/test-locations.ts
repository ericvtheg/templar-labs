import path from "node:path";
import fg from "fast-glob";
import type { MonorepoContext } from "../monorepo.ts";

const testFileGlobs = [
  "**/*.test.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
  "**/*.spec.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
];

const ignoredDirectories = [
  "**/node_modules/**",
  "**/{.output,.turbo,build,coverage,dist,test-results}/**",
];

function ownsTestFile(workspaceDirectory: string, testFilePath: string): boolean {
  return workspaceDirectory === "." || testFilePath.startsWith(`${workspaceDirectory}/`);
}

export async function checkTestLocations(context: MonorepoContext): Promise<string[]> {
  const testFilePaths = await fg(testFileGlobs, {
    cwd: context.rootDir,
    ignore: ignoredDirectories,
    onlyFiles: true,
    unique: true,
  });
  const workspaceDirectories = context.packages
    .map(({ packageJsonPath }) => path.posix.dirname(packageJsonPath))
    .toSorted((left, right) => right.length - left.length);

  return testFilePaths.toSorted().flatMap((testFilePath) => {
    const workspaceDirectory = workspaceDirectories.find((directory) =>
      ownsTestFile(directory, testFilePath),
    );

    if (workspaceDirectory === undefined) {
      return [];
    }

    const relativeTestPath =
      workspaceDirectory === "."
        ? testFilePath
        : path.posix.relative(workspaceDirectory, testFilePath);

    if (relativeTestPath.startsWith("test/")) {
      return [];
    }

    const expectedDirectory = workspaceDirectory === "." ? "test/" : `${workspaceDirectory}/test/`;

    return [`${testFilePath} must be under ${expectedDirectory}`];
  });
}
