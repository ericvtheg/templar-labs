import { AppConfigService } from "@templar/config";
import { Effect, Layer, Logger } from "effect";
import { LoggerFormat, loggerConfigDescriptorFor } from "./config";

export const TemplarLoggerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appConfig = yield* AppConfigService;
    const loggerConfig = yield* loggerConfigDescriptorFor(appConfig.environment);

    return Layer.mergeAll(
      loggerConfig.format === LoggerFormat.Json ? Logger.json : Logger.pretty,
      Logger.minimumLogLevel(loggerConfig.level),
      Layer.scopedDiscard(
        Effect.annotateLogsScoped({
          app: appConfig.appId,
          env: appConfig.environment,
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
