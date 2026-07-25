# @templar/scheduler

Recurring cron task conventions for Templar Labs projects.

The package keeps cron declarations, provider event handling, Effect execution,
and logging consistent across apps. Cloudflare Cron Triggers are the default
provider.

Queue delays and one-shot deferred work belong to `@templar/queue`. Durable
multi-step orchestration belongs to a future workflow package.

## Define Schedules Once

Keep the manifest in a pure module that both deployment and runtime code can
import:

```ts
import { defineSchedules } from "@templar/scheduler";

export const schedules = defineSchedules({
  nightlyCleanup: "0 2 * * *",
  weeklyDigest: "0 7 * * MON",
});
```

Schedule names must be unique, and each cron expression may belong to one
schedule. Compose several operations inside one handler when they should run at
the same cadence.

## Deploy Cron Triggers

Alchemy's Worker and TanStack Start resources accept `crons`. Derive that list
from the shared manifest so deployment and runtime cannot drift:

```ts
import { schedulerCrons } from "@templar/scheduler";
import { schedules } from "./apps/web/src/schedules.ts";

export const website = await templarApp("website", {
  project: "example",
  cwd: "apps/web",
  crons: schedulerCrons(schedules),
});
```

Cloudflare cron expressions contain five fields and run in UTC.

## Handle Scheduled Events

Register one Effect handler for every schedule:

```ts
import { makeScheduler } from "@templar/scheduler";
import { Effect } from "effect";
import { schedules } from "./schedules.ts";

const scheduler = makeScheduler(schedules, {
  nightlyCleanup: ({ executionId, scheduledAt }) =>
    Effect.logInfo("cleaning expired records", { executionId, scheduledAt }),
  weeklyDigest: ({ executionId, scheduledAt }) =>
    Effect.logInfo("sending weekly digest", { executionId, scheduledAt }),
});

export default {
  scheduled(controller: ScheduledController) {
    return Effect.runPromise(scheduler.handle(controller));
  },
};
```

Handlers can close over services created from Worker bindings, or provide their
own Effect layers before registration.

## Execution Identity

Each handler receives:

- `name`: the manifest key.
- `cron`: the exact expression that fired.
- `scheduledAt`: Cloudflare's scheduled timestamp, not the actual start time.
- `executionId`: a deterministic `<name>:<scheduledTime>` identifier.

Use `executionId` as a database key or downstream idempotency key when duplicate
effects would be unsafe. The scheduler provides stable identity but does not
claim exactly-once execution.

## Drivers

`SchedulerDriver<Input>` is the provider boundary. A driver converts the
provider's event into a normalized scheduler trigger. The shared service owns
registry validation, dispatch, errors, logging, tags, and layers. Cron syntax
validation remains the deployment provider's responsibility.

The root `makeScheduler` and `schedulerLayer` constructors use Cloudflare. A
future provider can implement `SchedulerDriver` without changing schedule or
handler definitions.
