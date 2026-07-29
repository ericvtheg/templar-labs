import { ApiAuthConfigError, ApiAuthInputError } from "./errors.ts";

export type ApiPermissionCatalog = Readonly<Record<string, readonly string[]>>;
export type ApiPermissionGrant<TCatalog extends ApiPermissionCatalog = ApiPermissionCatalog> =
  Readonly<{
    [TResource in keyof TCatalog]?: readonly Extract<TCatalog[TResource][number], string>[];
  }>;

export type ApiAuthKeyPolicy = {
  readonly defaultExpiresInDays?: number | null;
  readonly maximumExpiresInDays?: number | null;
  readonly maximumActivePerUser?: number;
};

export type ApiAuthManifest<TCatalog extends ApiPermissionCatalog = ApiPermissionCatalog> = {
  readonly audience: string;
  readonly keyPrefix: string;
  readonly permissions: TCatalog;
  readonly keys?: ApiAuthKeyPolicy;
};

export type NormalizedApiAuthManifest<
  TCatalog extends ApiPermissionCatalog = ApiPermissionCatalog,
> = Omit<ApiAuthManifest<TCatalog>, "keys"> & {
  readonly keys: {
    readonly defaultExpiresInDays: number | null;
    readonly maximumExpiresInDays: number | null;
    readonly maximumActivePerUser: number;
  };
};

const defaultKeyPolicy = {
  defaultExpiresInDays: 90,
  maximumExpiresInDays: 365,
  maximumActivePerUser: 10,
} as const;

export function defineApiAuthManifest<const TCatalog extends ApiPermissionCatalog>(
  manifest: ApiAuthManifest<TCatalog>,
): ApiAuthManifest<TCatalog> {
  normalizeApiAuthManifest(manifest);
  return manifest;
}

export function normalizeApiAuthManifest<TCatalog extends ApiPermissionCatalog>(
  manifest: ApiAuthManifest<TCatalog>,
): NormalizedApiAuthManifest<TCatalog> {
  const audience = nonEmptyConfig("audience", manifest.audience);
  const keyPrefix = nonEmptyConfig("keyPrefix", manifest.keyPrefix);

  if (!/^[a-z][a-z0-9_]*_$/.test(keyPrefix)) {
    throw new ApiAuthConfigError({
      field: "keyPrefix",
      message:
        "keyPrefix must use lowercase letters, numbers, or underscores and end in an underscore.",
    });
  }

  const permissionEntries = Object.entries(manifest.permissions);
  if (permissionEntries.length === 0) {
    throw new ApiAuthConfigError({
      field: "permissions",
      message: "At least one permission resource is required.",
    });
  }

  for (const [resource, actions] of permissionEntries) {
    nonEmptyConfig("permissions resource", resource);
    if (actions.length === 0 || actions.some((action) => action.trim() === "")) {
      throw new ApiAuthConfigError({
        field: `permissions.${resource}`,
        message: "Each permission resource requires at least one non-empty action.",
      });
    }
    if (new Set(actions).size !== actions.length) {
      throw new ApiAuthConfigError({
        field: `permissions.${resource}`,
        message: "Permission actions must be unique.",
      });
    }
  }

  const keys = {
    defaultExpiresInDays:
      manifest.keys?.defaultExpiresInDays ?? defaultKeyPolicy.defaultExpiresInDays,
    maximumExpiresInDays:
      manifest.keys?.maximumExpiresInDays ?? defaultKeyPolicy.maximumExpiresInDays,
    maximumActivePerUser:
      manifest.keys?.maximumActivePerUser ?? defaultKeyPolicy.maximumActivePerUser,
  };

  validatePositiveDays("keys.defaultExpiresInDays", keys.defaultExpiresInDays);
  validatePositiveDays("keys.maximumExpiresInDays", keys.maximumExpiresInDays);
  if (
    keys.defaultExpiresInDays !== null &&
    keys.maximumExpiresInDays !== null &&
    keys.defaultExpiresInDays > keys.maximumExpiresInDays
  ) {
    throw new ApiAuthConfigError({
      field: "keys.defaultExpiresInDays",
      message: "Default expiration cannot exceed maximum expiration.",
    });
  }
  if (!Number.isInteger(keys.maximumActivePerUser) || keys.maximumActivePerUser < 1) {
    throw new ApiAuthConfigError({
      field: "keys.maximumActivePerUser",
      message: "maximumActivePerUser must be a positive integer.",
    });
  }

  return { ...manifest, audience, keyPrefix, keys };
}

export function normalizePermissionGrant<TCatalog extends ApiPermissionCatalog>(
  catalog: TCatalog,
  grant: ApiPermissionGrant<TCatalog>,
): Record<string, readonly string[]> {
  const normalized: Record<string, readonly string[]> = {};

  const entries = Object.entries(grant) as [string, readonly string[]][];
  for (const [resource, requestedActions] of entries) {
    const availableActions = catalog[resource];
    if (availableActions === undefined) {
      throw new ApiAuthInputError({
        field: `permissions.${resource}`,
        message: `Unknown permission resource: ${resource}.`,
      });
    }

    const uniqueActions = [...new Set(requestedActions)];
    if (
      uniqueActions.length === 0 ||
      uniqueActions.some((action) => !availableActions.includes(action))
    ) {
      throw new ApiAuthInputError({
        field: `permissions.${resource}`,
        message: `Invalid permission action for ${resource}.`,
      });
    }
    normalized[resource] = uniqueActions.toSorted();
  }

  if (Object.keys(normalized).length === 0) {
    throw new ApiAuthInputError({
      field: "permissions",
      message: "At least one permission is required.",
    });
  }

  return normalized;
}

export function permissionsInclude(
  granted: Readonly<Record<string, readonly string[]>>,
  required: Readonly<Record<string, readonly string[]>>,
): boolean {
  return Object.entries(required).every(([resource, actions]) =>
    actions.every((action) => granted[resource]?.includes(action) === true),
  );
}

function nonEmptyConfig(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ApiAuthConfigError({ field, message: `${field} must be non-empty.` });
  }
  return trimmed;
}

function validatePositiveDays(field: string, value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value <= 0)) {
    throw new ApiAuthConfigError({ field, message: `${field} must be positive or null.` });
  }
}
