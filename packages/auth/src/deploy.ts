import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const authMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export type WithAuthMigrations<T extends { readonly migrationsDirs?: readonly string[] }> = Omit<
  T,
  "migrationsDirs"
> & {
  readonly migrationsDirs: readonly string[];
};

export function withAuthMigrations<T extends { readonly migrationsDirs?: readonly string[] }>(
  options: T,
): WithAuthMigrations<T> {
  return {
    ...options,
    migrationsDirs: [authMigrationsDir, ...(options.migrationsDirs ?? [])],
  };
}
