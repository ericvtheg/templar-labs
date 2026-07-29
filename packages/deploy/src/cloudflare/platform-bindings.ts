import { AppEnvironment, defaultTemplarAuthIssuer, type TemplarPlatformEnv } from "@templar/config";

export type TemplarPlatformBindingsInput = {
  readonly appId: string;
  readonly local: boolean;
};

export function createTemplarPlatformBindings(
  input: TemplarPlatformBindingsInput,
): TemplarPlatformEnv {
  return {
    TEMPLAR_APP_ID: input.appId,
    TEMPLAR_AUTH_ISSUER: defaultTemplarAuthIssuer,
    TEMPLAR_ENVIRONMENT: input.local ? AppEnvironment.Local : AppEnvironment.Prod,
  };
}
