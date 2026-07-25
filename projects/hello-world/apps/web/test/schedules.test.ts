import assert from "node:assert/strict";
import { test } from "node:test";
import { schedules } from "../src/schedules.ts";

test("minute heartbeat runs once per minute", () => {
  assert.deepEqual(schedules, {
    minuteHeartbeat: "* * * * *",
  });
});
