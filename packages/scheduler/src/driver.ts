import type { Effect } from "effect";
import type { SchedulerProviderError, SchedulerValidationError } from "./errors.ts";
import type { SchedulerTrigger } from "./types.ts";

export type SchedulerDriver<Input> = {
  readonly provider: string;
  readonly validateCron: (input: {
    readonly scheduleName: string;
    readonly cron: string;
  }) => Effect.Effect<void, SchedulerValidationError>;
  readonly toTrigger: (input: Input) => Effect.Effect<SchedulerTrigger, SchedulerProviderError>;
};
