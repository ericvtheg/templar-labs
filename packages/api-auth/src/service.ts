import { and, desc, eq, isNull } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { Context, Effect, Layer } from "effect";
import {
  type ApiAuthSecret,
  digestApiKeySecret,
  formatApiKey,
  normalizeApiAuthSecrets,
  parseApiKey,
  randomSecret,
  verifyApiKeySecret,
} from "./crypto.ts";
import {
  ApiAuthAccessError,
  type ApiAuthError,
  ApiAuthInputError,
  ApiAuthStorageError,
} from "./errors.ts";
import {
  type ApiAuthManifest,
  type ApiPermissionCatalog,
  type ApiPermissionGrant,
  type NormalizedApiAuthManifest,
  normalizeApiAuthManifest,
  normalizePermissionGrant,
  permissionsInclude,
} from "./manifest.ts";
import { type ApiAuthSchema, apiAuthSchema, apiKeys } from "./schema.ts";

export type ApiKeyOwner = {
  readonly userId: string;
};

export type StoredApiKey = {
  readonly id: string;
  readonly audience: string;
  readonly userId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly secretDigest: string;
  readonly secretVersion: number;
  readonly permissions: Readonly<Record<string, readonly string[]>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
};

export type ApiKeySummary = Omit<StoredApiKey, "secretDigest"> & {
  readonly start: string;
};

export type ApiKeyCreated = {
  readonly key: string;
  readonly apiKey: ApiKeySummary;
};

export type ApiPrincipal = {
  readonly keyId: string;
  readonly audience: string;
  readonly userId: string;
  readonly permissions: Readonly<Record<string, readonly string[]>>;
};

export type ApiKeyVerification =
  | {
      readonly authenticated: true;
      readonly principal: ApiPrincipal;
    }
  | {
      readonly authenticated: false;
      readonly reason: "insufficient-permissions" | "invalid-key";
    };

export type CreateApiKeyInput<TCatalog extends ApiPermissionCatalog> = ApiKeyOwner & {
  readonly name: string;
  readonly permissions: ApiPermissionGrant<TCatalog>;
  readonly expiresInDays?: number | null;
};

export type VerifyApiKeyInput<TCatalog extends ApiPermissionCatalog> = {
  readonly key: string;
  readonly permissions: ApiPermissionGrant<TCatalog>;
};

export type ApiAuthStore = {
  readonly insert: (record: StoredApiKey) => Promise<StoredApiKey>;
  readonly findById: (audience: string, id: string) => Promise<StoredApiKey | null>;
  readonly listByOwner: (audience: string, owner: ApiKeyOwner) => Promise<readonly StoredApiKey[]>;
  readonly revoke: (
    audience: string,
    owner: ApiKeyOwner,
    id: string,
    revokedAt: Date,
  ) => Promise<boolean>;
  readonly touchLastUsed: (audience: string, id: string, usedAt: Date) => Promise<void>;
};

export type ApiAuthService<TCatalog extends ApiPermissionCatalog = ApiPermissionCatalog> = {
  readonly manifest: NormalizedApiAuthManifest<TCatalog>;
  readonly createKey: (
    input: CreateApiKeyInput<TCatalog>,
  ) => Effect.Effect<ApiKeyCreated, ApiAuthError>;
  readonly listKeys: (owner: ApiKeyOwner) => Effect.Effect<readonly ApiKeySummary[], ApiAuthError>;
  readonly revokeKey: (
    input: ApiKeyOwner & { readonly id: string },
  ) => Effect.Effect<void, ApiAuthError>;
  readonly verifyKey: (
    input: VerifyApiKeyInput<TCatalog>,
  ) => Effect.Effect<ApiKeyVerification, ApiAuthError>;
};

export class ApiAuth extends Context.Tag("@templar/api-auth/ApiAuth")<ApiAuth, ApiAuthService>() {}

export type ApiAuthClock = {
  readonly now: () => Date;
  readonly randomId: () => string;
  readonly randomSecret: () => string;
};

export type ApiAuthDatabaseSchema = Record<string, unknown>;
export type ApiAuthDatabase = DrizzleD1Database<ApiAuthSchema>;

export type TemplarApiAuthConfig<
  TCatalog extends ApiPermissionCatalog,
  TSchema extends ApiAuthDatabaseSchema = ApiAuthDatabaseSchema,
> = {
  readonly db: D1Database;
  readonly manifest: ApiAuthManifest<TCatalog>;
  readonly secrets: readonly ApiAuthSecret[];
  readonly schema?: TSchema;
  readonly drizzle?: Omit<DrizzleConfig<TSchema & ApiAuthSchema>, "schema">;
  readonly clock?: Partial<ApiAuthClock>;
};

export function createTemplarApiAuth<
  TCatalog extends ApiPermissionCatalog,
  TSchema extends ApiAuthDatabaseSchema = ApiAuthDatabaseSchema,
>(config: TemplarApiAuthConfig<TCatalog, TSchema>): ApiAuthService<TCatalog> {
  const schema = {
    ...apiAuthSchema,
    ...config.schema,
  } as TSchema & ApiAuthSchema;
  const db = drizzle(config.db, {
    ...config.drizzle,
    schema,
  }) as unknown as ApiAuthDatabase;

  return makeApiAuthService({
    store: makeD1ApiAuthStore(db),
    manifest: config.manifest,
    secrets: config.secrets,
    ...(config.clock === undefined ? {} : { clock: config.clock }),
  });
}

export function makeApiAuthService<TCatalog extends ApiPermissionCatalog>(input: {
  readonly store: ApiAuthStore;
  readonly manifest: ApiAuthManifest<TCatalog>;
  readonly secrets: readonly ApiAuthSecret[];
  readonly clock?: Partial<ApiAuthClock>;
}): ApiAuthService<TCatalog> {
  const manifest = normalizeApiAuthManifest(input.manifest);
  const secrets = normalizeApiAuthSecrets(input.secrets);
  const clock: ApiAuthClock = {
    now: input.clock?.now ?? (() => new Date()),
    randomId: input.clock?.randomId ?? (() => crypto.randomUUID()),
    randomSecret: input.clock?.randomSecret ?? (() => randomSecret()),
  };

  return {
    manifest,
    createKey: (createInput) =>
      Effect.gen(function* () {
        const owner = yield* inputEffect(() => normalizeOwner(createInput));
        const name = yield* inputEffect(() => normalizeName(createInput.name));
        const permissions = yield* inputEffect(() =>
          normalizePermissionGrant(manifest.permissions, createInput.permissions),
        );
        const expiresInDays = yield* inputEffect(() =>
          expirationDays(manifest, createInput.expiresInDays),
        );
        const existingKeys = yield* storageEffect("list-keys", () =>
          input.store.listByOwner(manifest.audience, owner),
        );
        const now = clock.now();
        const activeCount = existingKeys.filter(
          (key) =>
            key.revokedAt === null &&
            (key.expiresAt === null || key.expiresAt.getTime() > now.getTime()),
        ).length;
        if (activeCount >= manifest.keys.maximumActivePerUser) {
          return yield* Effect.fail(new ApiAuthAccessError({ reason: "key-limit-reached" }));
        }

        const id = clock.randomId();
        const presentedSecret = clock.randomSecret();
        const currentSecret = secrets[0];
        if (currentSecret === undefined) {
          throw new Error("API auth secret normalization returned no current secret.");
        }
        const secretDigest = yield* Effect.promise(() =>
          digestApiKeySecret({
            audience: manifest.audience,
            id,
            presentedSecret,
            serverSecret: currentSecret.value,
          }),
        );
        const expiresAt =
          expiresInDays === null
            ? null
            : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1_000);
        const record: StoredApiKey = {
          id,
          audience: manifest.audience,
          userId: owner.userId,
          name,
          keyPrefix: manifest.keyPrefix,
          secretDigest,
          secretVersion: currentSecret.version,
          permissions,
          createdAt: now,
          updatedAt: now,
          expiresAt,
          lastUsedAt: null,
          revokedAt: null,
        };
        const stored = yield* storageEffect("create-key", () => input.store.insert(record));

        return {
          key: formatApiKey(manifest.keyPrefix, id, presentedSecret),
          apiKey: toSummary(stored),
        };
      }),
    listKeys: (ownerInput) =>
      Effect.gen(function* () {
        const owner = yield* inputEffect(() => normalizeOwner(ownerInput));
        const keys = yield* storageEffect("list-keys", () =>
          input.store.listByOwner(manifest.audience, owner),
        );
        return keys.map(toSummary);
      }),
    revokeKey: (revokeInput) =>
      Effect.gen(function* () {
        const owner = yield* inputEffect(() => normalizeOwner(revokeInput));
        const id = yield* inputEffect(() => requireNonEmptyInput("id", revokeInput.id));
        const revoked = yield* storageEffect("revoke-key", () =>
          input.store.revoke(manifest.audience, owner, id, clock.now()),
        );
        if (!revoked) {
          return yield* Effect.fail(new ApiAuthAccessError({ reason: "key-not-found" }));
        }
      }),
    verifyKey: (verifyInput) =>
      Effect.gen(function* () {
        const requiredPermissions = yield* inputEffect(() =>
          normalizePermissionGrant(manifest.permissions, verifyInput.permissions),
        );
        const parsed = parseApiKey(manifest.keyPrefix, verifyInput.key);
        if (parsed === null) {
          return invalidKey();
        }
        const record = yield* storageEffect("find-key", () =>
          input.store.findById(manifest.audience, parsed.id),
        );
        const now = clock.now();
        if (
          record === null ||
          record.revokedAt !== null ||
          (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime())
        ) {
          return invalidKey();
        }
        const secret = secrets.find((candidate) => candidate.version === record.secretVersion);
        if (secret === undefined) {
          return invalidKey();
        }
        const valid = yield* Effect.promise(() =>
          verifyApiKeySecret({
            audience: manifest.audience,
            id: record.id,
            presentedSecret: parsed.secret,
            serverSecret: secret.value,
            expectedDigest: record.secretDigest,
          }),
        );
        if (!valid) {
          return invalidKey();
        }

        if (!permissionsInclude(record.permissions, requiredPermissions)) {
          return {
            authenticated: false,
            reason: "insufficient-permissions",
          } as const;
        }

        yield* Effect.promise(() =>
          input.store.touchLastUsed(manifest.audience, record.id, now).catch(() => undefined),
        );

        return {
          authenticated: true,
          principal: {
            keyId: record.id,
            audience: record.audience,
            userId: record.userId,
            permissions: record.permissions,
          },
        } as const;
      }),
  };
}

export function makeApiAuthLayer(service: ApiAuthService): Layer.Layer<ApiAuth> {
  return Layer.succeed(ApiAuth, service);
}

export function makeD1ApiAuthStore(db: ApiAuthDatabase): ApiAuthStore {
  return {
    insert: async (record) => {
      await db.insert(apiKeys).values(toDatabaseRecord(record));
      return record;
    },
    findById: async (audience, id) => {
      const record = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.audience, audience), eq(apiKeys.id, id)))
        .get();
      return record === undefined ? null : fromDatabaseRecord(record);
    },
    listByOwner: async (audience, owner) => {
      const records = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.audience, audience), eq(apiKeys.userId, owner.userId)))
        .orderBy(desc(apiKeys.createdAt));
      return records.map(fromDatabaseRecord);
    },
    revoke: async (audience, owner, id, revokedAt) => {
      const result = await db
        .update(apiKeys)
        .set({ revokedAt, updatedAt: revokedAt })
        .where(
          and(
            eq(apiKeys.audience, audience),
            eq(apiKeys.id, id),
            eq(apiKeys.userId, owner.userId),
            isNull(apiKeys.revokedAt),
          ),
        );
      return (result.meta.changes ?? 0) > 0;
    },
    touchLastUsed: async (audience, id, usedAt) => {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: usedAt, updatedAt: usedAt })
        .where(and(eq(apiKeys.audience, audience), eq(apiKeys.id, id)));
    },
  };
}

function normalizeOwner(owner: ApiKeyOwner): ApiKeyOwner {
  const userId = requireNonEmptyInput("userId", owner.userId);
  return { userId };
}

function normalizeName(name: string): string {
  const normalized = requireNonEmptyInput("name", name);
  if (normalized.length > 80) {
    throw new ApiAuthInputError({
      field: "name",
      message: "API key names cannot exceed 80 characters.",
    });
  }
  return normalized;
}

function expirationDays<TCatalog extends ApiPermissionCatalog>(
  manifest: NormalizedApiAuthManifest<TCatalog>,
  requested: number | null | undefined,
): number | null {
  const value = requested === undefined ? manifest.keys.defaultExpiresInDays : requested;
  if (value === null) {
    if (manifest.keys.maximumExpiresInDays !== null) {
      throw new ApiAuthInputError({
        field: "expiresInDays",
        message: "Non-expiring API keys are not allowed by this application.",
      });
    }
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiAuthInputError({
      field: "expiresInDays",
      message: "Expiration must be a positive number of days.",
    });
  }
  if (manifest.keys.maximumExpiresInDays !== null && value > manifest.keys.maximumExpiresInDays) {
    throw new ApiAuthInputError({
      field: "expiresInDays",
      message: "Expiration exceeds this application's maximum.",
    });
  }
  return value;
}

function requireNonEmptyInput(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ApiAuthInputError({ field, message: `${field} must be non-empty.` });
  }
  return trimmed;
}

function invalidKey(): ApiKeyVerification {
  return { authenticated: false, reason: "invalid-key" };
}

function storageEffect<A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, ApiAuthStorageError> {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => new ApiAuthStorageError({ operation, cause }),
  });
}

function inputEffect<A>(run: () => A): Effect.Effect<A, ApiAuthInputError> {
  return Effect.try({
    try: run,
    catch: (cause) =>
      cause instanceof ApiAuthInputError
        ? cause
        : new ApiAuthInputError({ field: "input", message: "Invalid API auth input." }),
  });
}

function toSummary(record: StoredApiKey): ApiKeySummary {
  const { secretDigest: _secretDigest, ...safeRecord } = record;
  return {
    ...safeRecord,
    start: `${record.keyPrefix}${record.id.slice(0, 8)}`,
  };
}

function toDatabaseRecord(record: StoredApiKey): typeof apiKeys.$inferInsert {
  return {
    ...record,
    permissions: JSON.stringify(record.permissions),
  };
}

function fromDatabaseRecord(record: typeof apiKeys.$inferSelect): StoredApiKey {
  return {
    ...record,
    permissions: parsePermissions(record.permissions),
  };
}

function parsePermissions(value: string): Readonly<Record<string, readonly string[]>> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Stored API key permissions are invalid.");
  }
  const permissions: Record<string, readonly string[]> = {};
  for (const [resource, actions] of Object.entries(parsed)) {
    if (!Array.isArray(actions) || actions.some((action) => typeof action !== "string")) {
      throw new TypeError("Stored API key permissions are invalid.");
    }
    permissions[resource] = actions;
  }
  return permissions;
}
