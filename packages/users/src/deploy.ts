import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const usersMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export type WithUsersMigrations<T extends { readonly migrationsDirs?: readonly string[] }> = Omit<
  T,
  "migrationsDirs"
> & {
  readonly migrationsDirs: readonly string[];
};

export function withUsersMigrations<T extends { readonly migrationsDirs?: readonly string[] }>(
  options: T,
): WithUsersMigrations<T> {
  return {
    ...options,
    migrationsDirs: [usersMigrationsDir, ...(options.migrationsDirs ?? [])],
  };
}
