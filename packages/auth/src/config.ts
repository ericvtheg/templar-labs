import type { BetterAuthOptions } from "better-auth";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { AuthConfigError } from "./errors.ts";
import { hashTemplarPassword, verifyTemplarPassword } from "./password.ts";
import * as authSchema from "./schema.ts";

export type AuthDatabaseSchema = Record<string, unknown>;

export const templarAuthSessionExpiresInSeconds = 60 * 60 * 24 * 180;
export const templarAuthSessionUpdateAgeSeconds = 60 * 60 * 24;
export const templarAuthSessionFreshAgeSeconds = 60 * 60 * 24;

export type AuthOAuthProviderConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
};

export type AuthOAuthConfig = {
  readonly github?: AuthOAuthProviderConfig;
  readonly google?: AuthOAuthProviderConfig;
};

export type TemplarAuthConfig<TSchema extends AuthDatabaseSchema = AuthDatabaseSchema> = {
  readonly project: string;
  readonly app: string;
  readonly baseURL: string;
  readonly secret: string;
  readonly db: D1Database;
  readonly schema?: TSchema;
  readonly oauth?: AuthOAuthConfig;
  readonly emailAndPassword?: BetterAuthOptions["emailAndPassword"];
  readonly trustedOrigins?: readonly string[];
  readonly drizzle?: Omit<DrizzleConfig<TSchema>, "schema">;
};

export type NormalizedTemplarAuthConfig<TSchema extends AuthDatabaseSchema = AuthDatabaseSchema> =
  Omit<TemplarAuthConfig<TSchema>, "schema" | "oauth" | "trustedOrigins"> & {
    readonly schema: TSchema & AuthSchemaForAdapter;
    readonly oauth: AuthOAuthConfig;
    readonly trustedOrigins: readonly string[];
    readonly cookiePrefix: string;
    readonly appName: string;
  };

export type AuthSchemaForAdapter = typeof authSchema;

export function normalizeTemplarAuthConfig<TSchema extends AuthDatabaseSchema>(
  config: TemplarAuthConfig<TSchema>,
): NormalizedTemplarAuthConfig<TSchema> {
  const project = requireNonEmpty("project", config.project);
  const app = requireNonEmpty("app", config.app);
  const baseURL = requireURL(config.baseURL);
  const secret = requireNonEmpty("secret", config.secret);

  return {
    ...config,
    project,
    app,
    baseURL,
    secret,
    schema: {
      ...authSchema,
      ...config.schema,
    } as TSchema & AuthSchemaForAdapter,
    oauth: config.oauth ?? {},
    trustedOrigins: config.trustedOrigins ?? [],
    cookiePrefix: templarAuthCookiePrefix(project, app),
    appName: `Templar ${project}/${app}`,
  };
}

export function createBetterAuthOptions<TSchema extends AuthDatabaseSchema>(
  config: NormalizedTemplarAuthConfig<TSchema>,
  database: BetterAuthOptions["database"],
  plugins: NonNullable<BetterAuthOptions["plugins"]>,
): BetterAuthOptions {
  return {
    appName: config.appName,
    baseURL: config.baseURL,
    secret: config.secret,
    database,
    socialProviders: socialProviders(config.oauth),
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: emailAndPasswordOptions(config.emailAndPassword),
    session: {
      expiresIn: templarAuthSessionExpiresInSeconds,
      updateAge: templarAuthSessionUpdateAgeSeconds,
      freshAge: templarAuthSessionFreshAgeSeconds,
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: trustedProviderIds(config.oauth),
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
      },
    },
    advanced: {
      cookiePrefix: config.cookiePrefix,
      database: {
        generateId: "uuid",
      },
    },
    plugins,
  };
}

export function templarAuthCookiePrefix(project: string, app: string): string {
  return `templar.${slug(project)}.${slug(app)}.auth`;
}

function socialProviders(oauth: AuthOAuthConfig): BetterAuthOptions["socialProviders"] {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};

  if (oauth.github !== undefined) {
    providers.github = oauth.github;
  }

  if (oauth.google !== undefined) {
    providers.google = oauth.google;
  }

  return providers;
}

function trustedProviderIds(oauth: AuthOAuthConfig): string[] {
  return (["github", "google"] as const).filter((provider) => oauth[provider] !== undefined);
}

function emailAndPasswordOptions(
  options: NormalizedTemplarAuthConfig["emailAndPassword"],
): BetterAuthOptions["emailAndPassword"] {
  if (options === undefined || !options.enabled) {
    return { enabled: false };
  }

  return {
    ...options,
    password: options.password ?? {
      hash: hashTemplarPassword,
      verify: verifyTemplarPassword,
    },
  };
}

function requireNonEmpty(field: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new AuthConfigError({
      field,
      message: `${field} must be a non-empty string.`,
    });
  }

  return trimmed;
}

function requireURL(value: string): string {
  const baseURL = requireNonEmpty("baseURL", value);

  try {
    return new URL(baseURL).toString().replace(/\/$/, "");
  } catch (cause) {
    throw new AuthConfigError({
      field: "baseURL",
      message: cause instanceof Error ? cause.message : "baseURL must be a valid URL.",
    });
  }
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
