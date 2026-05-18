import { drizzle } from "drizzle-orm/d1";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { type DatabaseSchema, makeDatabaseLayer, makeDatabaseService } from "../service.ts";

export type D1DatabaseBinding = D1Database;

export type D1DatabaseOptions<TSchema extends DatabaseSchema> = Omit<
  DrizzleConfig<TSchema>,
  "schema"
> & {
  readonly schema: TSchema;
};

export function makeD1Database<TSchema extends DatabaseSchema>(
  binding: D1DatabaseBinding,
  options: D1DatabaseOptions<TSchema>,
) {
  return makeDatabaseService({
    provider: "d1",
    db: drizzle(binding, options),
  });
}

export const makeDatabase = makeD1Database;

export function d1DatabaseLayer<TSchema extends DatabaseSchema>(
  binding: D1DatabaseBinding,
  options: D1DatabaseOptions<TSchema>,
) {
  return makeDatabaseLayer(makeD1Database(binding, options));
}

export const databaseLayer = d1DatabaseLayer;
