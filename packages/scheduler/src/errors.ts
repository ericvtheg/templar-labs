import { Data } from "effect";

export type SchedulerProviderOperation = "decodeTrigger";

export class SchedulerValidationError extends Data.TaggedError("SchedulerValidationError")<{
  readonly provider: string;
  readonly scheduleName: string | undefined;
  readonly cron: string | undefined;
  readonly message: string;
}> {}

export class SchedulerProviderError extends Data.TaggedError("SchedulerProviderError")<{
  readonly provider: string;
  readonly operation: SchedulerProviderOperation;
  readonly cause: unknown;
}> {}

export class SchedulerTriggerNotFoundError extends Data.TaggedError(
  "SchedulerTriggerNotFoundError",
)<{
  readonly provider: string;
  readonly cron: string;
  readonly scheduledAt: Date;
}> {}

export class SchedulerExecutionError extends Data.TaggedError("SchedulerExecutionError")<{
  readonly provider: string;
  readonly scheduleName: string;
  readonly cron: string;
  readonly scheduledAt: Date;
  readonly executionId: string;
  readonly cause: unknown;
}> {}

export type SchedulerError =
  | SchedulerValidationError
  | SchedulerProviderError
  | SchedulerTriggerNotFoundError
  | SchedulerExecutionError;
