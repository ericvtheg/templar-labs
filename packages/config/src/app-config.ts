import { Config, Context, Layer } from "effect";
import { type AppEnvironment, appEnvironmentConfig } from "./environment";

export type AppConfig = {
  readonly appName: string;
  readonly projectName: string;
  readonly environment: AppEnvironment;
};

export const appConfigDescriptor: Config.Config<AppConfig> = Config.all({
  appName: Config.string("APP_NAME"),
  projectName: Config.string("PROJECT_NAME"),
  environment: appEnvironmentConfig,
});

export class AppConfigService extends Context.Tag("@templar/config/AppConfigService")<
  AppConfigService,
  AppConfig
>() {}

export const AppConfigLive = Layer.effect(AppConfigService, appConfigDescriptor);
