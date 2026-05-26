import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const paymentsMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export type WithPaymentsMigrations<T extends { readonly migrationsDirs?: readonly string[] }> =
  Omit<T, "migrationsDirs"> & {
    readonly migrationsDirs: readonly string[];
  };

export function withPaymentsMigrations<
  T extends {
    readonly migrationsDirs?: readonly string[];
  },
>(options: T): WithPaymentsMigrations<T> {
  return {
    ...options,
    migrationsDirs: [paymentsMigrationsDir, ...(options.migrationsDirs ?? [])],
  };
}
