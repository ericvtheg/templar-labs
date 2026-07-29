import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const apiAuthMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export type WithApiAuthMigrations<T extends { readonly migrationsDirs?: readonly string[] }> = Omit<
  T,
  "migrationsDirs"
> & {
  readonly migrationsDirs: readonly string[];
};

export function withApiAuthMigrations<T extends { readonly migrationsDirs?: readonly string[] }>(
  options: T,
): WithApiAuthMigrations<T> {
  return {
    ...options,
    migrationsDirs: [apiAuthMigrationsDir, ...(options.migrationsDirs ?? [])],
  };
}
