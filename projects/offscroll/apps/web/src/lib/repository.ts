import { makeDatabase } from "@templar/db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import * as schema from "../../../../db/schema.ts";
import { challenges, members, profiles, usage } from "../../../../db/schema.ts";
import {
  addDays,
  canEditUsage,
  challengeStatus,
  type Dashboard,
  type Invite,
  type Person,
  visibleUsage,
} from "./model.ts";
import type { ChallengeInput, ProfileInput, UsageInput } from "./validation.ts";

export async function readInvite(binding: D1Database, token: string): Promise<Invite | null> {
  const { db } = makeDatabase(binding, { schema });
  const [row] = await db
    .select({ challenge: challenges, owner: profiles.name })
    .from(challenges)
    .innerJoin(profiles, eq(profiles.id, challenges.creatorId))
    .where(eq(challenges.inviteToken, token))
    .limit(1);
  if (!row) {
    return null;
  }
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.challengeId, row.challenge.id));
  return {
    title: row.challenge.title,
    reward: row.challenge.reward,
    goal: row.challenge.goal,
    startDate: row.challenge.startDate,
    endDate: row.challenge.endDate,
    memberCount: count,
    owner: row.owner,
  };
}

// The actor is obtained from the signed Breli session, never from client input.
export function makeRepository(binding: D1Database, actor: Person, today: string) {
  const { db } = makeDatabase(binding, { schema });
  async function ensureProfile() {
    await db
      .insert(profiles)
      .values({ id: actor.id, name: actor.name || "Friend" })
      .onConflictDoUpdate({ target: profiles.id, set: { name: actor.name || "Friend" } });
  }

  async function dashboard(): Promise<Dashboard> {
    await ensureProfile();
    const [viewer] = await db.select().from(profiles).where(eq(profiles.id, actor.id)).limit(1);
    if (!viewer) {
      throw new Error("Your profile could not be loaded. Please try again.");
    }
    const rows = await db
      .select({ challenge: challenges })
      .from(members)
      .innerJoin(challenges, eq(challenges.id, members.challengeId))
      .where(eq(members.userId, actor.id))
      .orderBy(desc(challenges.createdAt))
      .limit(50);
    const ids = rows.map((row) => row.challenge.id);
    const circle = ids.length
      ? await db
          .select({
            challengeId: members.challengeId,
            person: {
              id: profiles.id,
              name: profiles.name,
            },
          })
          .from(members)
          .innerJoin(profiles, eq(profiles.id, members.userId))
          .where(inArray(members.challengeId, ids))
      : [];
    const groups = rows.map(({ challenge }) => ({
      ...challenge,
      members: circle.filter((row) => row.challengeId === challenge.id).map((row) => row.person),
    }));
    const personal = await db.select().from(usage).where(eq(usage.userId, actor.id));
    // Scope friend data in SQL, including historical challenge dates. This also avoids
    // a potentially oversized IN list of every person across all of the user's circles.
    const shared = ids.length
      ? await db
          .select({ entry: usage })
          .from(usage)
          .innerJoin(members, eq(members.userId, usage.userId))
          .innerJoin(challenges, eq(challenges.id, members.challengeId))
          .where(
            and(
              inArray(members.challengeId, ids),
              gte(usage.date, challenges.startDate),
              lte(usage.date, challenges.endDate),
            ),
          )
      : [];
    const logs = [
      ...new Map(
        [...personal, ...shared.map((row) => row.entry)].map((entry) => [
          `${entry.userId}/${entry.date}`,
          entry,
        ]),
      ).values(),
    ];
    return {
      mode: "live",
      today,
      viewer,
      challenges: groups,
      usage: visibleUsage(actor.id, groups, logs),
    };
  }

  async function create(input: ChallengeInput): Promise<void> {
    await ensureProfile();
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.userId, actor.id));
    if (count >= 50) {
      throw new Error("You have reached the 50-challenge limit.");
    }
    const id = crypto.randomUUID();
    const token = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await db.batch([
      db.insert(challenges).values({
        id,
        title: input.title,
        reward: input.reward,
        startDate: today,
        endDate: addDays(today, input.duration - 1),
        goal: input.goal,
        color: input.color,
        creatorId: actor.id,
        inviteToken: token,
        createdAt: Date.now(),
      }),
      db.insert(members).values({ challengeId: id, userId: actor.id, joinedAt: Date.now() }),
    ]);
  }

  async function log(input: UsageInput): Promise<void> {
    await ensureProfile();
    const locked = await db
      .select({ id: challenges.id })
      .from(members)
      .innerJoin(challenges, eq(challenges.id, members.challengeId))
      .where(
        and(
          eq(members.userId, actor.id),
          lte(challenges.startDate, input.date),
          gte(challenges.endDate, input.date),
          sql`${challenges.endDate} < ${addDays(today, -1)}`,
        ),
      )
      .limit(1);
    if (locked.length || !canEditUsage([], input.date, today)) {
      throw new Error(
        "Choose a date from the past 30 days. Check-ins lock 24 hours after a challenge ends.",
      );
    }
    const values = { ...input, userId: actor.id, updatedAt: Date.now() };
    await db
      .insert(usage)
      .values(values)
      .onConflictDoUpdate({
        target: [usage.userId, usage.date],
        set: values,
      });
  }

  async function updateProfile(input: ProfileInput): Promise<void> {
    await ensureProfile();
    await db.update(profiles).set(input).where(eq(profiles.id, actor.id));
  }

  async function join(token: string): Promise<void> {
    await ensureProfile();
    const [group] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.inviteToken, token))
      .limit(1);
    if (!group || challengeStatus(group, today) !== "active") {
      throw new Error("This invitation has ended or is no longer available.");
    }
    const [existing] = await db
      .select()
      .from(members)
      .where(and(eq(members.challengeId, group.id), eq(members.userId, actor.id)))
      .limit(1);
    if (existing) {
      return;
    }
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.userId, actor.id));
    if (count >= 50) {
      throw new Error("You have reached the 50-challenge limit.");
    }
    // Capacity is checked inside the insert so concurrent joins cannot overfill a circle.
    const result =
      await db.run(sql`INSERT OR IGNORE INTO offscroll_members (challenge_id, user_id, joined_at)
      SELECT ${group.id}, ${actor.id}, ${Date.now()}
      WHERE (SELECT count(*) FROM offscroll_members WHERE challenge_id = ${group.id}) < 32`);
    if (!result.meta.changes) {
      throw new Error("This circle is full (32 friends maximum).");
    }
  }

  return { dashboard, create, log, updateProfile, join };
}
