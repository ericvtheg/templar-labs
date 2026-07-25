import { Context, Effect, Layer } from "effect";
import type { SchedulerDriver } from "./driver.ts";
import {
  type SchedulerError,
  SchedulerExecutionError,
  SchedulerTriggerNotFoundError,
  SchedulerValidationError,
} from "./errors.ts";
import { withSchedulerExecutionAnnotations, withSchedulerLogging } from "./logging.ts";
import type {
  SchedulerDefinitions,
  SchedulerExecution,
  SchedulerHandlers,
  SchedulerName,
  SchedulerTrigger,
} from "./types.ts";

export type SchedulerService<Input = unknown> = {
  readonly handle: (input: Input) => Effect.Effect<void, SchedulerError>;
};

export const SCHEDULER_TAG_IDENTIFIER: unique symbol = Symbol(
  "@templar/scheduler/SchedulerTagIdentifier",
);

export type SchedulerTagId<Input> = {
  readonly [SCHEDULER_TAG_IDENTIFIER]: Input;
};

export type SchedulerTag<Input> = Context.Tag<SchedulerTagId<Input>, SchedulerService<Input>> & {
  readonly handle: (input: Input) => Effect.Effect<void, SchedulerError, SchedulerTagId<Input>>;
};

export function makeSchedulerTag<Input>(
  identifier = "@templar/scheduler/Scheduler",
): SchedulerTag<Input> {
  const tag = Context.GenericTag<SchedulerTagId<Input>, SchedulerService<Input>>(identifier);

  return Object.assign(tag, {
    handle: Effect.serviceFunctionEffect(tag, (scheduler) => scheduler.handle),
  });
}

export class Scheduler extends Context.Tag("@templar/scheduler/Scheduler")<
  Scheduler,
  SchedulerService
>() {
  static readonly handle = Effect.serviceFunctionEffect(this, (scheduler) => scheduler.handle);
}

export function makeSchedulerLayer<Input>(
  service: SchedulerService<Input>,
): Layer.Layer<Scheduler> {
  return Layer.succeed(Scheduler, service as unknown as SchedulerService);
}

export function makeSchedulerLayerFor<Id, Input>(
  tag: Context.Tag<Id, SchedulerService<Input>>,
  service: SchedulerService<Input>,
): Layer.Layer<Id> {
  return Layer.succeed(tag, service);
}

export function defineSchedules<const Definitions extends SchedulerDefinitions>(
  definitions: Definitions,
): Definitions {
  return definitions;
}

export function schedulerCrons<Definitions extends SchedulerDefinitions>(
  definitions: Definitions,
): string[] {
  return Object.values(definitions);
}

export function makeSchedulerService<Input, const Definitions extends SchedulerDefinitions>(input: {
  readonly driver: SchedulerDriver<Input>;
  readonly schedules: Definitions;
  readonly handlers: SchedulerHandlers<Definitions>;
}): SchedulerService<Input> {
  return {
    handle: (providerInput) =>
      validateScheduler(input.driver, input.schedules, input.handlers).pipe(
        Effect.zipRight(input.driver.toTrigger(providerInput)),
        Effect.flatMap((trigger) =>
          dispatchTrigger(input.driver.provider, input.schedules, input.handlers, trigger),
        ),
        withSchedulerLogging(input.driver.provider),
        Effect.asVoid,
      ),
  };
}

function validateScheduler<Input, Definitions extends SchedulerDefinitions>(
  driver: SchedulerDriver<Input>,
  schedules: Definitions,
  handlers: SchedulerHandlers<Definitions>,
): Effect.Effect<void, SchedulerValidationError> {
  return Effect.gen(function* () {
    const entries = Object.entries(schedules);
    const seenCrons = new Set<string>();

    for (const [scheduleName, cron] of entries) {
      if (scheduleName.trim().length === 0) {
        return yield* schedulerValidationFailure({
          provider: driver.provider,
          scheduleName,
          cron,
          message: "Scheduled task names must not be empty.",
        });
      }

      if (!Object.hasOwn(handlers, scheduleName)) {
        return yield* schedulerValidationFailure({
          provider: driver.provider,
          scheduleName,
          cron,
          message: `Scheduled task "${scheduleName}" does not have a handler.`,
        });
      }

      if (seenCrons.has(cron)) {
        return yield* schedulerValidationFailure({
          provider: driver.provider,
          scheduleName,
          cron,
          message: `Cron expression "${cron}" is assigned to more than one scheduled task.`,
        });
      }

      seenCrons.add(cron);
      yield* driver.validateCron({ scheduleName, cron });
    }

    for (const handlerName of Object.keys(handlers)) {
      if (!Object.hasOwn(schedules, handlerName)) {
        return yield* schedulerValidationFailure({
          provider: driver.provider,
          scheduleName: handlerName,
          cron: undefined,
          message: `Handler "${handlerName}" does not have a schedule.`,
        });
      }
    }
  });
}

function dispatchTrigger<Definitions extends SchedulerDefinitions>(
  provider: string,
  schedules: Definitions,
  handlers: SchedulerHandlers<Definitions>,
  trigger: SchedulerTrigger,
): Effect.Effect<SchedulerExecution<SchedulerName<Definitions>>, SchedulerError> {
  const entry = Object.entries(schedules).find(([, cron]) => cron === trigger.cron);

  if (entry === undefined) {
    return Effect.fail(
      new SchedulerTriggerNotFoundError({
        provider,
        cron: trigger.cron,
        scheduledAt: trigger.scheduledAt,
      }),
    );
  }

  const [rawScheduleName] = entry;
  const scheduleName = rawScheduleName as SchedulerName<Definitions>;
  const execution: SchedulerExecution<SchedulerName<Definitions>> = {
    name: scheduleName,
    cron: trigger.cron,
    scheduledAt: trigger.scheduledAt,
    executionId: `${scheduleName}:${trigger.scheduledAt.getTime()}`,
  };
  const handler = handlers[scheduleName] as (
    execution: SchedulerExecution<SchedulerName<Definitions>>,
  ) => Effect.Effect<void, unknown>;

  return handler(execution).pipe(
    Effect.mapError(
      (cause) =>
        new SchedulerExecutionError({
          provider,
          scheduleName,
          cron: execution.cron,
          scheduledAt: execution.scheduledAt,
          executionId: execution.executionId,
          cause,
        }),
    ),
    withSchedulerExecutionAnnotations(execution),
    Effect.as(execution),
  );
}

function schedulerValidationFailure(input: {
  readonly provider: string;
  readonly scheduleName: string | undefined;
  readonly cron: string | undefined;
  readonly message: string;
}): Effect.Effect<never, SchedulerValidationError> {
  return Effect.fail(new SchedulerValidationError(input));
}
