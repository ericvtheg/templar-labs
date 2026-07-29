import { Config, Context, Layer } from "effect";
import { type AppEnvironment, appEnvironmentConfig } from "./environment.ts";
import { templarPlatformBindingNames } from "./platform.ts";

export type AppConfig = {
  readonly appId: string;
  readonly authIssuer: string;
  readonly environment: AppEnvironment;
};

export const appConfigDescriptor: Config.Config<AppConfig> = Config.all({
  appId: Config.string(templarPlatformBindingNames.appId),
  authIssuer: Config.string(templarPlatformBindingNames.authIssuer),
  environment: appEnvironmentConfig,
});

export class AppConfigService extends Context.Tag("@templar/config/AppConfigService")<
  AppConfigService,
  AppConfig
>() {}

export const AppConfigLive = Layer.effect(AppConfigService, appConfigDescriptor);
