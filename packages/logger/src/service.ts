import { AppConfigService } from "@templar/config";
import { Effect, Layer, Logger } from "effect";
import {
  defaultLoggerFormat,
  defaultLoggerLevel,
  LoggerFormat,
  loggerConfigDescriptor,
  logLevelFromName,
} from "./config";

export const TemplarLoggerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appConfig = yield* AppConfigService;
    const loggerConfig = yield* loggerConfigDescriptor;

    const level =
      loggerConfig.level === undefined
        ? defaultLoggerLevel(appConfig.environment)
        : logLevelFromName(loggerConfig.level);
    const format = loggerConfig.format ?? defaultLoggerFormat(appConfig.environment);

    return Layer.mergeAll(
      format === LoggerFormat.Json ? Logger.json : Logger.pretty,
      Logger.minimumLogLevel(level),
      Layer.scopedDiscard(
        Effect.annotateLogsScoped({
          app: appConfig.appName,
          env: appConfig.environment,
          project: appConfig.projectName,
        }),
      ),
    );
  }),
);

export function withLogContext<A, E, R>(
  self: Effect.Effect<A, E, R>,
  annotations: Record<string, unknown>,
): Effect.Effect<A, E, R> {
  return Effect.annotateLogs(self, annotations);
}
