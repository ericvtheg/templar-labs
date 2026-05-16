import { type AppEnvironment, AppEnvironment as Environment } from "@templar/config";
import { Config, LogLevel, Option } from "effect";

export const LoggerLevelName = {
  Trace: "trace",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "fatal",
  Off: "off",
} as const;

export type LoggerLevelName = (typeof LoggerLevelName)[keyof typeof LoggerLevelName];

export const LoggerFormat = {
  Json: "json",
  Pretty: "pretty",
} as const;

export type LoggerFormat = (typeof LoggerFormat)[keyof typeof LoggerFormat];

export type LoggerConfig = {
  readonly level: LoggerLevelName | undefined;
  readonly format: LoggerFormat | undefined;
};

export const loggerConfigDescriptor: Config.Config<LoggerConfig> = Config.all({
  level: Config.option(
    Config.literal(
      LoggerLevelName.Trace,
      LoggerLevelName.Debug,
      LoggerLevelName.Info,
      LoggerLevelName.Warn,
      LoggerLevelName.Error,
      LoggerLevelName.Fatal,
      LoggerLevelName.Off,
    )("LOG_LEVEL"),
  ).pipe(Config.map(Option.getOrUndefined)),
  format: Config.option(Config.literal(LoggerFormat.Json, LoggerFormat.Pretty)("LOG_FORMAT")).pipe(
    Config.map(Option.getOrUndefined),
  ),
});

export function defaultLoggerLevel(environment: AppEnvironment): LogLevel.LogLevel {
  return environment === Environment.Prod ? LogLevel.Info : LogLevel.Debug;
}

export function defaultLoggerFormat(environment: AppEnvironment): LoggerFormat {
  return environment === Environment.Prod ? LoggerFormat.Json : LoggerFormat.Pretty;
}

export function logLevelFromName(level: LoggerLevelName): LogLevel.LogLevel {
  switch (level) {
    case LoggerLevelName.Trace:
      return LogLevel.Trace;
    case LoggerLevelName.Debug:
      return LogLevel.Debug;
    case LoggerLevelName.Info:
      return LogLevel.Info;
    case LoggerLevelName.Warn:
      return LogLevel.Warning;
    case LoggerLevelName.Error:
      return LogLevel.Error;
    case LoggerLevelName.Fatal:
      return LogLevel.Fatal;
    case LoggerLevelName.Off:
      return LogLevel.None;
  }
}
