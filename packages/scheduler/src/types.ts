import type { Effect } from "effect";

export type SchedulerDefinitions = Readonly<Record<string, string>>;

export type SchedulerName<Definitions extends SchedulerDefinitions> = Extract<
  keyof Definitions,
  string
>;

export type SchedulerTrigger = {
  readonly cron: string;
  readonly scheduledAt: Date;
};

export type SchedulerExecution<Name extends string = string> = SchedulerTrigger & {
  readonly name: Name;
  readonly executionId: string;
};

export type SchedulerHandler<Name extends string = string> = (
  execution: SchedulerExecution<Name>,
) => Effect.Effect<void, unknown>;

export type SchedulerHandlers<Definitions extends SchedulerDefinitions> = {
  readonly [Name in SchedulerName<Definitions>]: SchedulerHandler<Name>;
};
