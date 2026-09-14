import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../src/lib/auth.server.ts";
import { missions } from "../src/lib/curriculum.ts";
import { handleTrip } from "../src/lib/trip.server.ts";
import type { TripData } from "../src/lib/types.ts";

const origin = "https://china.ericventor.com";
const secret = "unit-test-secret-never-a-real-deployment-secret";
async function testCookie(
  userId = "gavin",
  email = "gavin@example.com",
  emailVerified = true,
  expiresAt = Date.now() + 60_000,
  admin = false,
) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = {
    id: `session-${userId}`,
    userId,
    name: userId,
    email,
    emailVerified,
    image: null,
    admin,
    createdAt: Date.now(),
    expiresAt,
  };
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return `templar.auth.session=${Buffer.from(iv).toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}
function d1Adapter(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      return {
        bind(...params: SQLInputValue[]) {
          values = params;
          return this;
        },
        first() {
          return Promise.resolve(sqlite.prepare(sql).get(...values) ?? null);
        },
        all() {
          return Promise.resolve({ results: sqlite.prepare(sql).all(...values), success: true });
        },
        run() {
          return Promise.resolve(sqlite.prepare(sql).run(...values));
        },
      };
    },
  } as unknown as D1Database;
}
describe("private trip API against real SQLite and encrypted SSO cookies", () => {
  let sqlite: DatabaseSync;
  let env: Bindings;
  let cookie: string;
  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
      readFileSync(new URL("../../../db/migrations/0000_brief_bug.sql", import.meta.url), "utf8"),
    );
    env = {
      AUTH_SECRET: secret,
      TEMPLAR_AUTH_ISSUER: "https://auth.example.com",
      CREW_EMAILS: "gavin@example.com,rolo@example.com",
      DB: d1Adapter(sqlite),
    };
    cookie = await testCookie();
  });
  afterEach(() => {
    sqlite.close();
  });
  function call(path: string, body?: unknown, userCookie = cookie) {
    return handleTrip(
      new Request(`${origin}/api/trip/${path}`, {
        headers: { cookie: userCookie, origin, "content-type": "application/json" },
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
      }),
      env,
    );
  }
  it("never returns private curriculum for signed-out, tampered, expired, unverified, or uninvited accounts", async () => {
    for (const userCookie of [
      "",
      `${cookie}bad`,
      await testCookie("gavin", "gavin@example.com", true, 1),
      await testCookie("outsider", "outsider@example.com"),
      await testCookie("gavin", "gavin@example.com", false),
    ]) {
      const response = await call("state", undefined, userCookie);
      expect([401, 403]).toContain(response.status);
      expect(await response.text()).not.toContain("Rolo");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("honors verified central platform owners without inviting their separate SSO email", async () => {
    env.CREW_EMAILS = "";
    const owner = await testCookie("owner", "owner@example.com", true, Date.now() + 60_000, true);
    expect((await call("state", undefined, owner)).status).toBe(200);
    expect((await call("profile", { name: "Owner" }, owner)).status).toBe(200);
    const unverified = await testCookie(
      "owner",
      "owner@example.com",
      false,
      Date.now() + 60_000,
      true,
    );
    expect((await call("state", undefined, unverified)).status).toBe(403);
    const ordinary = await testCookie("outsider", "owner@example.com");
    expect((await call("profile", { name: "Impostor", admin: true }, ordinary)).status).toBe(403);
  });
  it("empty allowlists and revoked guest accounts lose access even with a valid old session", async () => {
    env.CREW_EMAILS = "";
    expect((await call("state")).status).toBe(403);
    expect((await call("profile", { name: "Gavin" })).status).toBe(403);
  });
  it("requires same-origin writes and bounded JSON before touching state", async () => {
    for (const badOrigin of ["https://evil.example", "null"]) {
      const response = await handleTrip(
        new Request(`${origin}/api/trip/profile`, {
          method: "POST",
          headers: { cookie, origin: badOrigin, "content-type": "application/json" },
          body: '{"name":"Gavin"}',
        }),
        env,
      );
      expect(response.status).toBe(403);
    }
    expect((await call("profile", { name: "x".repeat(5000) })).status).toBe(413);
    for (const name of ["", "x".repeat(33), 42, null]) {
      expect((await call("profile", { name })).status).toBe(400);
    }
    const invalid = await handleTrip(
      new Request(`${origin}/api/trip/profile`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: "[",
      }),
      env,
    );
    expect(invalid.status).toBe(400);
    expect(
      (sqlite.prepare("SELECT COUNT(*) AS count FROM members").get() as { count: number }).count,
    ).toBe(0);
  });
  it("stores names under the authenticated identity, never a caller-supplied user ID", async () => {
    expect((await call("profile", { name: "Gavin", userId: "rolo" })).status).toBe(200);
    const state = (await (await call("state")).json()) as TripData;
    expect(state.user).toEqual({ id: "gavin", name: "Gavin" });
    expect(state.board).toEqual([{ id: "gavin", name: "Gavin", completed: 0 }]);
    expect(state.missions).toHaveLength(missions.length);
    expect(JSON.stringify(state)).not.toContain("@example.com");
  });
  it("grades on the server, requires every exercise, persists progress, and cannot farm completion or review level", async () => {
    await call("profile", { name: "Gavin" });
    const mission = missions[0];
    if (!mission) {
      throw new Error("Missing beginner mission");
    }
    const wrong = await call("answer", {
      missionId: mission.id,
      task: 0,
      answer: "wrong",
      correct: true,
    });
    expect(await wrong.json()).toEqual({ correct: false, completed: false });
    for (const [task, phrase] of mission.phrases.entries()) {
      const response = await call("answer", { missionId: mission.id, task, answer: phrase.hanzi });
      expect(await response.json()).toEqual({ correct: true, completed: false });
    }
    const last = {
      missionId: mission.id,
      task: mission.phrases.length,
      answer: String(mission.answer),
    };
    expect(await (await call("answer", last)).json()).toEqual({ correct: true, completed: true });
    const before = sqlite
      .prepare("SELECT level, due FROM mastery WHERE user_id = 'gavin' AND task = ?")
      .get(mission.phrases.length);
    await call("answer", last);
    await call("answer", last);
    expect(
      sqlite
        .prepare("SELECT level, due FROM mastery WHERE user_id = 'gavin' AND task = ?")
        .get(mission.phrases.length),
    ).toEqual(before);
    const state = (await (await call("state")).json()) as TripData;
    expect(state.completed).toEqual([mission.id]);
    expect(state.activity).toHaveLength(1);
    expect(state.board[0]?.completed).toBe(1);
    const rolo = await testCookie("rolo", "rolo@example.com");
    expect(((await (await call("state", undefined, rolo)).json()) as TripData).mastery).toEqual([]);
    sqlite
      .prepare("UPDATE mastery SET due = 1 WHERE user_id = 'gavin' AND task = ?")
      .run(mission.phrases.length);
    await call("answer", last);
    expect(
      sqlite
        .prepare("SELECT level FROM mastery WHERE user_id = 'gavin' AND task = ?")
        .get(mission.phrases.length)?.["level"],
    ).toBe(2);
  });
  it("rejects invalid exercises and enforces one cheer per person per actual completion", async () => {
    await call("profile", { name: "Gavin" });
    for (const body of [
      { missionId: "unknown", task: 0, answer: "hi" },
      { missionId: "basics", task: -1, answer: "hi" },
      { missionId: "basics", task: 0.5, answer: "hi" },
      { missionId: "basics", task: 0, answer: null },
    ]) {
      expect((await call("answer", body)).status).toBe(400);
    }
    expect((await call("cheer", { targetId: "gavin", missionId: "basics" })).status).toBe(400);
    await call("cheer", { targetId: "rolo", missionId: "basics" });
    expect(
      (sqlite.prepare("SELECT COUNT(*) AS count FROM cheers").get() as { count: number }).count,
    ).toBe(0);
    sqlite.prepare("INSERT INTO members VALUES ('rolo', 'Rolo')").run();
    sqlite.prepare("INSERT INTO completions VALUES ('rolo', 'basics', 100)").run();
    await call("cheer", { targetId: "rolo", missionId: "basics" });
    await call("cheer", { targetId: "rolo", missionId: "basics" });
    const state = (await (await call("state")).json()) as TripData;
    expect(state.activity[0]?.cheers).toBe(1);
    expect(state.activity[0]?.cheered).toBe(1);
  });
});
