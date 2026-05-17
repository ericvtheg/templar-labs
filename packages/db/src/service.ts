import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Context, Effect, Layer } from "effect";

export type DatabaseSchema = Record<string, unknown>;

export type D1DatabaseClient<TSchema extends DatabaseSchema = DatabaseSchema> =
  DrizzleD1Database<TSchema>;

export type DatabaseProvider = "d1";

export type DatabaseService<TSchema extends DatabaseSchema = DatabaseSchema> = {
  readonly provider: DatabaseProvider;
  readonly db: D1DatabaseClient<TSchema>;
};

export class Database extends Context.Tag("@templar/db/Database")<Database, DatabaseService>() {
  static readonly db = Effect.map(this, (database) => database.db);
}

export function makeDatabaseService<TSchema extends DatabaseSchema>(input: {
  readonly provider: DatabaseProvider;
  readonly db: D1DatabaseClient<TSchema>;
}): DatabaseService<TSchema> {
  return input;
}

export function makeDatabaseLayer<TSchema extends DatabaseSchema>(
  service: DatabaseService<TSchema>,
): Layer.Layer<Database> {
  return Layer.succeed(Database, service as DatabaseService);
}

export function withDatabase<A, E, R>(
  f: (db: D1DatabaseClient) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | Database> {
  return Effect.flatMap(Database, (database) => f(database.db));
}
