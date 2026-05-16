import { Config } from "effect";

export const AppEnvironment = {
  Local: "local",
  Prod: "prod",
} as const;

export type AppEnvironment = (typeof AppEnvironment)[keyof typeof AppEnvironment];

export const appEnvironmentConfig: Config.Config<AppEnvironment> = Config.withDefault(
  Config.literal(AppEnvironment.Local, AppEnvironment.Prod)("APP_ENV"),
  AppEnvironment.Local,
);

export function isLocal(environment: AppEnvironment): boolean {
  return environment === AppEnvironment.Local;
}

export function isProd(environment: AppEnvironment): boolean {
  return environment === AppEnvironment.Prod;
}
