import {
  AppEnvironment,
  defaultTemplarAuthIssuer,
  templarPlatformBindingNames,
} from "@templar/config";

export type TemplarPlatformBindingSpecs = {
  readonly TEMPLAR_APP_ID: string;
  readonly TEMPLAR_AUTH_ISSUER: string;
  readonly TEMPLAR_ENVIRONMENT: AppEnvironment;
};

export type TemplarPlatformBindingsInput = {
  readonly appId: string;
  readonly local: boolean;
};

export function createTemplarPlatformBindings(
  input: TemplarPlatformBindingsInput,
): TemplarPlatformBindingSpecs {
  return {
    TEMPLAR_APP_ID: input.appId,
    TEMPLAR_AUTH_ISSUER: defaultTemplarAuthIssuer,
    TEMPLAR_ENVIRONMENT: input.local ? AppEnvironment.Local : AppEnvironment.Prod,
  };
}

export function assertNoTemplarBindingCollisions(
  bindings: Readonly<Record<string, unknown>> | undefined,
  additionalReservedNames: readonly string[] = [],
) {
  if (bindings === undefined) {
    return;
  }

  const reservedNames = new Set([
    ...Object.values(templarPlatformBindingNames),
    ...additionalReservedNames,
  ]);
  const collision = Object.keys(bindings).find((name) => reservedNames.has(name));

  if (collision !== undefined) {
    throw new Error(
      `templarApp binding "${collision}" is managed automatically; use the corresponding templarApp option instead.`,
    );
  }
}
