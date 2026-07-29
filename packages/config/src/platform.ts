import type { AppEnvironment } from "./environment.ts";

export const defaultTemplarAuthIssuer = "https://auth.breli.app";

export const templarPlatformBindingNames = {
  appId: "TEMPLAR_APP_ID",
  authIssuer: "TEMPLAR_AUTH_ISSUER",
  environment: "TEMPLAR_ENVIRONMENT",
} as const;

export type TemplarPlatformEnv = {
  readonly TEMPLAR_APP_ID: string;
  readonly TEMPLAR_AUTH_ISSUER: string;
  readonly TEMPLAR_ENVIRONMENT: AppEnvironment;
};
