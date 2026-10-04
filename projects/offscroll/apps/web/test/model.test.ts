import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemo, restoreDemo } from "../src/lib/demo.ts";
import {
  addDays,
  type Challenge,
  canEditUsage,
  challengeStatus,
  datesBetween,
  formatMinutes,
  isFinal,
  leaderboard,
  streak,
  type Usage,
  visibleUsage,
} from "../src/lib/model.ts";
import { challengeInput, dateInput, usageInput } from "../src/lib/validation.ts";

const group: Challenge = {
  id: "group",
  title: "The unplug",
  reward: "Coffee with friends",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  goal: 45,
  color: "sage",
  creatorId: "a",
  inviteToken: "token",
  members: [
    { id: "a", name: "Alex" },
    { id: "b", name: "Bea" },
    { id: "c", name: "Chris" },
  ],
};
const log = (userId: string, date: string, minutes: number): Usage => ({
  userId,
  date,
  instagram: minutes,
  tiktok: 0,
  youtube: 0,
  other: 0,
  note: "",
  updatedAt: 1,
});

test("date arithmetic is UTC-based across months, leap years, and DST", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(datesBetween("2026-10-03", "2026-10-02"), []);
  assert.equal(challengeStatus(group, "2026-10-07"), "active");
  assert.equal(challengeStatus(group, "2026-10-08"), "completed");
});

test("missing days are unranked rather than zero, and today's partial totals are excluded", () => {
  const rows = leaderboard(
    group,
    [
      log("a", "2026-10-01", 40),
      log("a", "2026-10-02", 20),
      log("a", "2026-10-03", 1440),
      log("b", "2026-10-01", 0),
    ],
    "2026-10-03",
  );
  assert.equal(rows[0]?.id, "a");
  assert.equal(rows[0]?.average, 30);
  assert.equal(rows[0]?.rank, 1);
  assert.equal(rows.find((row) => row.id === "b")?.rank, null);
  assert.equal(rows.find((row) => row.id === "c")?.average, null);
});

test("zero-minute entries count, and ties share a competition rank", () => {
  const rows = leaderboard(
    group,
    [log("a", "2026-10-01", 0), log("b", "2026-10-01", 0), log("c", "2026-10-01", 10)],
    "2026-10-02",
  );
  assert.deepEqual(
    rows.map((row) => row.rank),
    [1, 1, 3],
  );
  assert.equal(rows[0]?.checkedDays, 1);
});

test("no one is ranked before the first day closes", () => {
  assert.ok(
    leaderboard(group, [log("a", "2026-10-01", 5)], "2026-10-01").every((row) => row.rank === null),
  );
});

test("streaks require consecutive complete check-ins under the personal goal", () => {
  const entries = [log("a", "2026-10-01", 40), log("a", "2026-10-02", 0)];
  assert.equal(streak(entries, 45, "2026-10-03"), 2);
  assert.equal(streak([...entries, log("a", "2026-10-03", 60)], 45, "2026-10-03"), 0);
  assert.equal(streak(entries, 45, "2026-10-04"), 0);
});

test("final results lock only after the 24-hour grace day", () => {
  assert.equal(isFinal(group, "2026-10-08"), false);
  assert.equal(isFinal(group, "2026-10-09"), true);
  assert.equal(canEditUsage([group], "2026-10-03", "2026-10-08"), true);
  assert.equal(canEditUsage([group], "2026-10-03", "2026-10-09"), false);
  assert.equal(canEditUsage([], "2026-10-10", "2026-10-09"), false);
  assert.equal(canEditUsage([], "2026-09-01", "2026-10-09"), false);
});

test("friends only receive entries in a shared challenge's date range", () => {
  const entries = [
    log("a", "2026-09-10", 100),
    log("b", "2026-09-30", 50),
    log("b", "2026-10-02", 40),
    log("stranger", "2026-10-02", 10),
  ];
  assert.deepEqual(visibleUsage("a", [group], entries), [entries[0], entries[2]]);
});

test("screen time and date validation reject invalid and impossible input", () => {
  const input = { date: "2026-10-01", instagram: 0, tiktok: 0, youtube: 0, other: 0, note: "" };
  assert.equal(usageInput.safeParse(input).success, true);
  for (const instagram of [-1, 1.5, 1441, Number.NaN]) {
    assert.equal(usageInput.safeParse({ ...input, instagram }).success, false);
  }
  assert.equal(usageInput.safeParse({ ...input, instagram: 1000, tiktok: 1000 }).success, false);
  assert.equal(dateInput.safeParse("2026-02-30").success, false);
  assert.equal(dateInput.safeParse("2024-02-29").success, true);
  assert.equal(dateInput.safeParse("not a date").success, false);
  assert.equal(
    challengeInput.safeParse({ title: "a", reward: "b", duration: 0, goal: 45, color: "sage" })
      .success,
    false,
  );
});

test("preview storage is validated, day-scoped, and cannot become an authenticated dashboard", () => {
  const demo = createDemo("2026-10-04");
  assert.deepEqual(restoreDemo(JSON.stringify(demo), demo), demo);
  assert.equal(restoreDemo("broken", demo), demo);
  assert.equal(restoreDemo(JSON.stringify({ ...demo, mode: "live" }), demo), demo);
  assert.equal(restoreDemo(JSON.stringify({ ...demo, today: "2026-10-03" }), demo), demo);
  assert.equal(restoreDemo(JSON.stringify({ ...demo, usage: [null] }), demo), demo);
});

test("minute formatting is compact and consistent", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(42), "42m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(125), "2h 5m");
});
