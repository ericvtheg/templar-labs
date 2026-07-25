import { Effect } from "effect";
import {
  type SchedulerError,
  SchedulerExecutionError,
  SchedulerProviderError,
  SchedulerTriggerNotFoundError,
  SchedulerValidationError,
} from "./errors.ts";
import type { SchedulerExecution } from "./types.ts";

export function withSchedulerLogging(provider: string) {
  return <Name extends string, R>(
    self: Effect.Effect<SchedulerExecution<Name>, SchedulerError, R>,
  ): Effect.Effect<SchedulerExecution<Name>, SchedulerError, R> =>
    self.pipe(
      Effect.tap((execution) =>
        Effect.logDebug("scheduled task completed").pipe(
          Effect.annotateLogs(schedulerExecutionAnnotations(execution)),
        ),
      ),
      Effect.tapError((error) =>
        Effect.logError("scheduled task failed", error).pipe(
          Effect.annotateLogs(schedulerErrorAnnotations(error)),
        ),
      ),
      Effect.annotateLogs({
        package: "@templar/scheduler",
        provider,
        operation: "run",
      }),
      Effect.withLogSpan("scheduler.run"),
    );
}

export function withSchedulerExecutionAnnotations<Name extends string>(
  execution: SchedulerExecution<Name>,
) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(Effect.annotateLogs(schedulerExecutionAnnotations(execution)));
}

function schedulerExecutionAnnotations(execution: SchedulerExecution): Record<string, unknown> {
  return {
    schedule: execution.name,
    cron: execution.cron,
    scheduledAt: execution.scheduledAt.toISOString(),
    executionId: execution.executionId,
  };
}

function schedulerErrorAnnotations(error: SchedulerError): Record<string, unknown> {
  if (error instanceof SchedulerExecutionError) {
    return {
      schedule: error.scheduleName,
      cron: error.cron,
      scheduledAt: error.scheduledAt.toISOString(),
      executionId: error.executionId,
    };
  }

  if (error instanceof SchedulerTriggerNotFoundError) {
    return {
      cron: error.cron,
      scheduledAt: error.scheduledAt.toISOString(),
    };
  }

  if (error instanceof SchedulerValidationError) {
    return {
      ...(error.scheduleName === undefined ? {} : { schedule: error.scheduleName }),
      ...(error.cron === undefined ? {} : { cron: error.cron }),
    };
  }

  if (error instanceof SchedulerProviderError) {
    return {
      providerOperation: error.operation,
    };
  }

  return {};
}
