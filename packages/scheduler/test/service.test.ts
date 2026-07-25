import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import type { SchedulerDriver } from "../src/driver.ts";
import {
  SchedulerExecutionError,
  SchedulerTriggerNotFoundError,
  SchedulerValidationError,
} from "../src/errors.ts";
import {
  defineSchedules,
  makeSchedulerLayerFor,
  makeSchedulerService,
  makeSchedulerTag,
  schedulerCrons,
} from "../src/service.ts";
import type { SchedulerExecution } from "../src/types.ts";

type TestTrigger = {
  readonly cron: string;
  readonly scheduledAt: Date;
};

const TEST_SCHEDULED_AT = new Date("2026-07-26T07:00:00.000Z");
const TEST_SCHEDULER = makeSchedulerTag<TestTrigger>("@test/Scheduler");

test("defineSchedules preserves names and schedulerCrons returns deployment expressions", () => {
  const schedules = defineSchedules({
    nightlyCleanup: "0 2 * * *",
    weeklyDigest: "0 7 * * MON",
  });

  assert.deepEqual(schedules, {
    nightlyCleanup: "0 2 * * *",
    weeklyDigest: "0 7 * * MON",
  });
  assert.deepEqual(schedulerCrons(schedules), ["0 2 * * *", "0 7 * * MON"]);
});

test("handle dispatches the matching task with deterministic execution metadata", async () => {
  const executions: SchedulerExecution[] = [];
  const schedules = defineSchedules({
    nightlyCleanup: "0 2 * * *",
    weeklyDigest: "0 7 * * MON",
  });
  const scheduler = makeSchedulerService({
    driver: makeDriver(),
    schedules,
    handlers: {
      nightlyCleanup: (execution) =>
        Effect.sync(() => {
          executions.push(execution);
        }),
      weeklyDigest: (execution) =>
        Effect.sync(() => {
          executions.push(execution);
        }),
    },
  });

  await Effect.runPromise(
    scheduler.handle({
      cron: "0 7 * * MON",
      scheduledAt: TEST_SCHEDULED_AT,
    }),
  );

  assert.deepEqual(executions, [
    {
      name: "weeklyDigest",
      cron: "0 7 * * MON",
      scheduledAt: TEST_SCHEDULED_AT,
      executionId: `weeklyDigest:${TEST_SCHEDULED_AT.getTime()}`,
    },
  ]);
});

test("handle requires an exact configured cron expression", async () => {
  const schedules = defineSchedules({ nightlyCleanup: "0 2 * * *" });
  const scheduler = makeSchedulerService({
    driver: makeDriver(),
    schedules,
    handlers: {
      nightlyCleanup: () => Effect.void,
    },
  });

  const result = await Effect.runPromise(
    Effect.either(
      scheduler.handle({
        cron: "0 3 * * *",
        scheduledAt: TEST_SCHEDULED_AT,
      }),
    ),
  );

  if (Either.isRight(result)) {
    assert.fail("Expected an unknown cron to fail.");
  }

  assert.ok(result.left instanceof SchedulerTriggerNotFoundError);
  assert.equal(result.left.cron, "0 3 * * *");
});

test("duplicate cron expressions are rejected", async () => {
  const schedules = defineSchedules({
    first: "0 2 * * *",
    second: "0 2 * * *",
  });
  const scheduler = makeSchedulerService({
    driver: makeDriver(),
    schedules,
    handlers: {
      first: () => Effect.void,
      second: () => Effect.void,
    },
  });

  const result = await Effect.runPromise(
    Effect.either(
      scheduler.handle({
        cron: "0 2 * * *",
        scheduledAt: TEST_SCHEDULED_AT,
      }),
    ),
  );

  if (Either.isRight(result)) {
    assert.fail("Expected duplicate cron expressions to fail.");
  }

  assert.ok(result.left instanceof SchedulerValidationError);
  assert.match(result.left.message, /more than one scheduled task/);
});

test("handler failures are wrapped with execution context", async () => {
  const failure = new Error("cleanup failed");
  const schedules = defineSchedules({ nightlyCleanup: "0 2 * * *" });
  const scheduler = makeSchedulerService({
    driver: makeDriver(),
    schedules,
    handlers: {
      nightlyCleanup: () => Effect.fail(failure),
    },
  });

  const result = await Effect.runPromise(
    Effect.either(
      scheduler.handle({
        cron: "0 2 * * *",
        scheduledAt: TEST_SCHEDULED_AT,
      }),
    ),
  );

  if (Either.isRight(result)) {
    assert.fail("Expected the scheduled handler to fail.");
  }

  assert.ok(result.left instanceof SchedulerExecutionError);
  assert.equal(result.left.scheduleName, "nightlyCleanup");
  assert.equal(result.left.executionId, `nightlyCleanup:${TEST_SCHEDULED_AT.getTime()}`);
  assert.equal(result.left.cause, failure);
});

test("custom scheduler tags preserve typed provider input", async () => {
  let handled = false;
  const schedules = defineSchedules({ nightlyCleanup: "0 2 * * *" });
  const scheduler = makeSchedulerService({
    driver: makeDriver(),
    schedules,
    handlers: {
      nightlyCleanup: () =>
        Effect.sync(() => {
          handled = true;
        }),
    },
  });

  await Effect.runPromise(
    TEST_SCHEDULER.handle({
      cron: "0 2 * * *",
      scheduledAt: TEST_SCHEDULED_AT,
    }).pipe(Effect.provide(makeSchedulerLayerFor(TEST_SCHEDULER, scheduler))),
  );

  assert.equal(handled, true);
});

function makeDriver(): SchedulerDriver<TestTrigger> {
  return {
    provider: "test",
    toTrigger: (trigger) => Effect.succeed(trigger),
  };
}
