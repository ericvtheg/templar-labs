import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { addDays, datesBetween, leaderboard, streak } from "../src/lib/model.ts";
import { makeRepository, readInvite } from "../src/lib/repository.ts";
import type { ChallengeInput, UsageInput } from "../src/lib/validation.ts";
import { testDatabase } from "./support/d1.ts";

const databases: ReturnType<typeof testDatabase>[] = [];
function setup() {
  const database = testDatabase();
  databases.push(database);
  return database;
}
afterEach(() => {
  for (const database of databases) {
    database.close();
  }
  databases.length = 0;
});

const input: ChallengeInput = {
  title: "The weekly unplug",
  reward: "Coffee on the crew",
  duration: 7,
  goal: 45,
  color: "sage",
};
const entry = (date: string, instagram = 30): UsageInput => ({
  date,
  instagram,
  tiktok: 0,
  youtube: 0,
  other: 0,
  note: "An afternoon outside.",
});

test("create, privately invite, join idempotently, log and rank real participants", async () => {
  const database = setup();
  const alex = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-01");
  await alex.create(input);
  const state = await alex.dashboard();
  const group = state.challenges[0];
  assert.ok(group);
  assert.equal(group.members.length, 1);
  assert.match(group.inviteToken, /^[a-f0-9]{48}$/);
  assert.equal(group.endDate, "2026-10-07");
  const invitation = await readInvite(database.binding, group.inviteToken);
  assert.ok(invitation);
  assert.equal(invitation.memberCount, 1);
  assert.equal("inviteToken" in invitation, false);
  assert.equal("members" in invitation, false);
  const bea = makeRepository(database.binding, { id: "bea", name: "Bea" }, "2026-10-02");
  await bea.join(group.inviteToken);
  await bea.join(group.inviteToken);
  await alex.log(entry("2026-10-01", 35));
  await bea.log(entry("2026-10-01", 20));
  const joined = await bea.dashboard();
  assert.equal(joined.challenges[0]?.members.length, 2);
  const leaders = leaderboard(joined.challenges[0] ?? group, joined.usage, "2026-10-02");
  assert.equal(leaders[0]?.id, "bea");
  assert.equal(leaders[0]?.rank, 1);
});

test("check-ins upsert for the authenticated actor without overwriting friends", async () => {
  const database = setup();
  const alex = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-04");
  const bea = makeRepository(database.binding, { id: "bea", name: "Bea" }, "2026-10-04");
  await alex.log(entry("2026-10-03", 50));
  await bea.log(entry("2026-10-03", 40));
  await alex.log(entry("2026-10-03", 0));
  const state = await alex.dashboard();
  assert.equal(state.usage.length, 1);
  assert.equal(state.usage[0]?.instagram, 0);
  assert.equal((await bea.dashboard()).usage[0]?.instagram, 40);
});

test("dashboard privacy scopes challenges, notes and dates to shared circles", async () => {
  const database = setup();
  const alex = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-03");
  const bea = makeRepository(database.binding, { id: "bea", name: "Bea" }, "2026-10-03");
  const stranger = makeRepository(
    database.binding,
    { id: "stranger", name: "Stranger" },
    "2026-10-03",
  );
  await alex.create(input);
  const group = (await alex.dashboard()).challenges[0];
  assert.ok(group);
  await bea.join(group.inviteToken);
  await bea.log(entry("2026-10-01"));
  await bea.log(entry("2026-10-03"));
  await stranger.create({ ...input, title: "An unrelated circle" });
  await stranger.log(entry("2026-10-03"));
  const state = await alex.dashboard();
  assert.equal(state.challenges.length, 1);
  assert.deepEqual(
    state.usage.map((row) => [row.userId, row.date]),
    [["bea", "2026-10-03"]],
  );
  assert.equal(
    (await stranger.dashboard()).usage.some((row) => row.userId === "bea"),
    false,
  );
});

test("ended invitations and finalized check-ins are rejected without altering results", async () => {
  const database = setup();
  const first = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-01");
  await first.create(input);
  await first.log(entry("2026-10-01"));
  const group = (await first.dashboard()).challenges[0];
  assert.ok(group);
  const grace = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-08");
  await grace.log(entry("2026-10-01", 25));
  const final = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-09");
  await assert.rejects(final.log(entry("2026-10-01", 0)), /Check-ins lock/);
  await assert.rejects(final.log(entry("2026-10-10")), /Choose a date/);
  const bea = makeRepository(database.binding, { id: "bea", name: "Bea" }, "2026-10-09");
  await assert.rejects(bea.join(group.inviteToken), /invitation has ended/);
  assert.equal((await final.dashboard()).usage[0]?.instagram, 25);
});

test("historical completed results remain visible", async () => {
  const database = setup();
  const first = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-01-01");
  await first.create(input);
  await first.log(entry("2026-01-01", 10));
  const later = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-04");
  assert.equal((await later.dashboard()).usage[0]?.date, "2026-01-01");
});

test("personal streaks are not truncated to a chart or challenge history window", async () => {
  const database = setup();
  const today = "2026-10-04";
  const actor = { id: "alex", name: "Alex" };
  const repository = makeRepository(database.binding, actor, today);
  await repository.dashboard();
  const insert = database.sqlite.prepare(
    "INSERT INTO offscroll_usage (user_id, date, instagram, tiktok, youtube, other, note, updated_at) VALUES (?, ?, 10, 0, 0, 0, '', 1)",
  );
  for (const date of datesBetween(addDays(today, -99), today)) {
    insert.run(actor.id, date);
  }
  const state = await repository.dashboard();
  assert.equal(state.usage.length, 100);
  assert.equal(streak(state.usage, state.viewer.goal, today), 100);
});

test("circle capacity is enforced and personal goals do not rewrite challenge rules", async () => {
  const database = setup();
  const alex = makeRepository(database.binding, { id: "alex", name: "Alex" }, "2026-10-01");
  await alex.create(input);
  const group = (await alex.dashboard()).challenges[0];
  assert.ok(group);
  await Promise.all(
    Array.from({ length: 31 }, (_, i) =>
      makeRepository(
        database.binding,
        { id: `friend-${i}`, name: `Friend ${i}` },
        "2026-10-01",
      ).join(group.inviteToken),
    ),
  );
  await assert.rejects(
    makeRepository(database.binding, { id: "extra", name: "Extra" }, "2026-10-01").join(
      group.inviteToken,
    ),
    /circle is full/,
  );
  await alex.updateProfile({ goal: 30, baseline: 90 });
  const state = await alex.dashboard();
  assert.equal(state.viewer.goal, 30);
  assert.equal(state.challenges[0]?.goal, 45);
  assert.equal(state.challenges[0]?.members.length, 32);
});
