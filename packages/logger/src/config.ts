import { type AppEnvironment, AppEnvironment as Environment } from "@templar/config";
import { Config, LogLevel } from "effect";

export const LoggerFormat = {
  Json: "json",
  Pretty: "pretty",
} as const;

export type LoggerFormat = (typeof LoggerFormat)[keyof typeof LoggerFormat];

export type LoggerConfig = {
  readonly level: LogLevel.LogLevel;
  readonly format: LoggerFormat;
};

export function loggerConfigDescriptorFor(
  environment: AppEnvironment,
): Config.Config<LoggerConfig> {
  return Config.all({
    level: Config.withDefault(Config.logLevel("LOG_LEVEL"), defaultLoggerLevel(environment)),
    format: Config.withDefault(
      Config.literal(LoggerFormat.Json, LoggerFormat.Pretty)("LOG_FORMAT"),
      defaultLoggerFormat(environment),
    ),
  });
}

export const loggerConfigDescriptor: Config.Config<LoggerConfig> = loggerConfigDescriptorFor(
  Environment.Local,
);

export function defaultLoggerLevel(environment: AppEnvironment): LogLevel.LogLevel {
  return environment === Environment.Prod ? LogLevel.Info : LogLevel.Debug;
}

export function defaultLoggerFormat(environment: AppEnvironment): LoggerFormat {
  return environment === Environment.Prod ? LoggerFormat.Json : LoggerFormat.Pretty;
}
