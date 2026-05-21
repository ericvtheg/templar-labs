import { Effect } from "effect";
import type { EmailOperation } from "./errors.ts";

export type EmailLoggingInput = {
  readonly provider: string;
  readonly operation: EmailOperation;
  readonly app?: string;
};

export function withEmailLogging(input: EmailLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("email operation completed")),
      Effect.tapError((error) => Effect.logError("email operation failed", error)),
      Effect.annotateLogs(emailLogAnnotations(input)),
      Effect.withLogSpan(`email.${input.operation}`),
    );
}

function emailLogAnnotations(input: EmailLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/email",
    provider: input.provider,
    operation: input.operation,
    ...(input.app === undefined ? {} : { app: input.app }),
  };
}
