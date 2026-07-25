import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { type Auth as BetterAuth, betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzle } from "drizzle-orm/d1";
import {
  type AuthDatabaseSchema,
  createBetterAuthOptions,
  normalizeTemplarAuthConfig,
  type TemplarAuthConfig,
} from "./config.ts";

export type TemplarAuth<TSchema extends AuthDatabaseSchema = AuthDatabaseSchema> = BetterAuth<
  ReturnType<typeof createTemplarAuthOptions<TSchema>>
>;

export function createTemplarAuthServer<TSchema extends AuthDatabaseSchema>(
  config: TemplarAuthConfig<TSchema>,
) {
  return betterAuth(createTemplarAuthOptions(config));
}

// Compatibility alias for existing database-backed applications.
export function createTemplarAuth<TSchema extends AuthDatabaseSchema>(
  config: TemplarAuthConfig<TSchema>,
) {
  return createTemplarAuthServer(config);
}

export function createTemplarAuthOptions<TSchema extends AuthDatabaseSchema>(
  config: TemplarAuthConfig<TSchema>,
) {
  const normalized = normalizeTemplarAuthConfig(config);
  const db = drizzle(normalized.db, {
    ...normalized.drizzle,
    schema: normalized.schema,
  });
  const database = drizzleAdapter(db, {
    provider: "sqlite",
    schema: normalized.schema,
  });

  return createBetterAuthOptions(normalized, database, [tanstackStartCookies()]);
}
