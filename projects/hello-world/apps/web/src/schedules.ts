import { defineSchedules } from "@templar/scheduler";

export const schedules = defineSchedules({
  minuteHeartbeat: "* * * * *",
});
