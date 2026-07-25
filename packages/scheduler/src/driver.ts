import type { Effect } from "effect";
import type { SchedulerProviderError } from "./errors.ts";
import type { SchedulerTrigger } from "./types.ts";

export type SchedulerDriver<Input> = {
  readonly provider: string;
  readonly toTrigger: (input: Input) => Effect.Effect<SchedulerTrigger, SchedulerProviderError>;
};
