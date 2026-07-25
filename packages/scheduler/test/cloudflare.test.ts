import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { cloudflareSchedulerDriver, makeScheduler } from "../src/drivers/cloudflare.ts";
import { SchedulerProviderError } from "../src/errors.ts";
import { defineSchedules } from "../src/service.ts";

const TEST_SCHEDULED_TIME = Date.parse("2026-07-26T07:00:00.000Z");

test("Cloudflare scheduler decodes and dispatches ScheduledController input", async () => {
  const executions: Array<{
    readonly name: string;
    readonly cron: string;
    readonly scheduledAt: Date;
    readonly executionId: string;
  }> = [];
  const schedules = defineSchedules({ weeklyDigest: "0 7 * * MON" });
  const scheduler = makeScheduler(schedules, {
    weeklyDigest: (execution) =>
      Effect.sync(() => {
        executions.push(execution);
      }),
  });

  await Effect.runPromise(
    scheduler.handle({
      cron: "0 7 * * MON",
      scheduledTime: TEST_SCHEDULED_TIME,
    }),
  );

  assert.deepEqual(executions, [
    {
      name: "weeklyDigest",
      cron: "0 7 * * MON",
      scheduledAt: new Date(TEST_SCHEDULED_TIME),
      executionId: `weeklyDigest:${TEST_SCHEDULED_TIME}`,
    },
  ]);
});

test("Cloudflare driver rejects malformed scheduled controller values", async () => {
  const invalidControllers = [
    { cron: "", scheduledTime: TEST_SCHEDULED_TIME },
    { cron: "0 7 * * MON", scheduledTime: Number.NaN },
    { cron: "0 7 * * MON", scheduledTime: -1 },
    { cron: "0 7 * * MON", scheduledTime: Number.MAX_SAFE_INTEGER },
  ];

  const results = await Promise.all(
    invalidControllers.map((controller) =>
      Effect.runPromise(Effect.either(cloudflareSchedulerDriver.toTrigger(controller))),
    ),
  );

  for (const result of results) {
    if (Either.isRight(result)) {
      assert.fail("Expected Cloudflare trigger decoding to fail.");
    }

    assert.ok(result.left instanceof SchedulerProviderError);
    assert.equal(result.left.operation, "decodeTrigger");
  }
});
