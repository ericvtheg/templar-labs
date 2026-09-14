import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tts, stt, generate } = vi.hoisted(() => ({
  tts: vi.fn(),
  stt: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    textToSpeech = { convert: tts };
    speechToText = { convert: stt };
  },
}));
vi.mock("@templar/llm", () => ({ makeLLM: () => ({ generateObject: generate }) }));

import { handleCoach } from "../src/lib/coach.server.ts";
import type { CoachReply, CoachScene } from "../src/lib/coach-types.ts";
import { missions } from "../src/lib/curriculum.ts";
import { gradeMatching } from "../src/lib/learning.ts";
import { takePracticeBudget } from "../src/lib/practice-budget.server.ts";
import { transcribePractice } from "../src/lib/transcribe.server.ts";
import { serveSpeech, speechCacheKey, type VoiceBindings } from "../src/lib/voice.server.ts";
import { defaultMandarinVoiceId } from "../src/lib/voice-config.ts";

function adapter(sqlite: DatabaseSync): D1Database {
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
        run() {
          return Promise.resolve(sqlite.prepare(sql).run(...values));
        },
      };
    },
  } as unknown as D1Database;
}
let sqlite: DatabaseSync;
let env: VoiceBindings & { OPENROUTER_API_TOKEN?: string };
let objects: Map<string, ArrayBuffer>;
beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(":memory:");
  for (const file of ["0000_brief_bug.sql", "0001_fearless_komodo.sql"]) {
    sqlite.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  objects = new Map();
  env = {
    DB: adapter(sqlite),
    ELEVENLABS_API_KEY: "test-only-not-a-key",
    R2: {
      get: vi.fn(async (key: string) =>
        objects.has(key) ? { body: new Response(objects.get(key)).body } : null,
      ),
      put: vi.fn(async (key: string, data: ArrayBuffer) => {
        objects.set(key, data);
      }),
    } as unknown as R2Bucket,
  };
  tts.mockImplementation(async () => new Response(new Uint8Array([73, 68, 51, 1])).body);
  stt.mockResolvedValue({ text: "你好。" });
  generate.mockReturnValue(
    Effect.succeed({
      value: { scene: "Eric volunteered Gavin as the hotel translator. Greet the receptionist." },
    }),
  );
});
afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const speechRequest = (text: string, speed = "normal") =>
  new Request(
    `https://china.ericventor.com/api/trip/speech?${new URLSearchParams({ text, speed })}`,
  );
describe("bounded, private speech", () => {
  it("only generates approved text, caches it, and preserves pitch with separately generated slow speech", async () => {
    expect((await serveSpeech(speechRequest("Say arbitrary paid text"), env)).status).toBe(400);
    expect((await serveSpeech(speechRequest("你好。", "0.123"), env)).status).toBe(400);
    expect(tts).not.toHaveBeenCalled();
    const first = await serveSpeech(speechRequest("你好。"), env);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("content-type")).toBe("audio/mpeg");
    expect((await serveSpeech(speechRequest("你好。"), env)).status).toBe(200);
    expect(tts).toHaveBeenCalledTimes(1);
    await serveSpeech(speechRequest("你好。", "slow"), env);
    expect(tts).toHaveBeenCalledTimes(2);
    expect(tts.mock.calls[1]?.[1]).toMatchObject({
      languageCode: "zh",
      voiceSettings: { speed: 0.75 },
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM speech_jobs").get()?.["n"]).toBe(0);
  });
  it("supports Safari byte-range audio requests without regenerating clips", async () => {
    await serveSpeech(speechRequest("你好。"), env);
    const partial = new Request(speechRequest("你好。"), { headers: { range: "bytes=0-1" } });
    const response = await serveSpeech(partial, env);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect(response.headers.get("x-china-audio-cache")).toBe("HIT");
    expect((await response.arrayBuffer()).byteLength).toBe(2);
    expect(
      (
        await serveSpeech(
          new Request(speechRequest("你好。"), { headers: { range: "bytes=99-" } }),
          env,
        )
      ).status,
    ).toBe(416);
    expect(tts).toHaveBeenCalledTimes(1);
  });
  it("does not spend credits if storage or credentials are missing", async () => {
    const noStorage = { DB: env.DB, ELEVENLABS_API_KEY: "test" };
    expect((await serveSpeech(speechRequest("你好。"), noStorage)).status).toBe(503);
    env = { ...env, ELEVENLABS_API_KEY: "" };
    expect((await serveSpeech(speechRequest("你好。"), env)).status).toBe(503);
    expect(tts).not.toHaveBeenCalled();
  });
  it("does not start a duplicate paid generation while another worker holds the lease", async () => {
    vi.useFakeTimers();
    const key = await speechCacheKey("你好。", "normal", defaultMandarinVoiceId);
    sqlite
      .prepare("INSERT INTO speech_jobs VALUES (?, ?, ?)")
      .run(key, "other-worker", Date.now() + 60000);
    const result = serveSpeech(speechRequest("你好。"), env);
    await vi.waitFor(() => expect(env.R2?.get).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(6000);
    expect((await result).status).toBe(503);
    expect(tts).not.toHaveBeenCalled();
  });
  it("redacts provider errors and releases the lease", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      /* Suppress the expected redacted provider error in this test. */
    });
    tts.mockRejectedValue(Object.assign(new Error("SECRET_PROVIDER_DETAILS"), { statusCode: 402 }));
    const response = await serveSpeech(speechRequest("你好。"), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET_PROVIDER_DETAILS");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET_PROVIDER_DETAILS");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM speech_jobs").get()?.["n"]).toBe(0);
  });
  it("transcribes opt-in recordings without storing audio and rejects unbounded requests", async () => {
    const body = {
      missionId: "basics",
      audioBase64: btoa("audio"),
      contentType: "audio/webm;codecs=opus",
    };
    const result = await transcribePractice(body, env, "owner");
    expect(await result.json()).toEqual({ text: "你好。" });
    expect(objects.size).toBe(0);
    expect(stt.mock.calls[0]?.[0]).toMatchObject({
      modelId: "scribe_v2",
      languageCode: "zho",
      tagAudioEvents: false,
    });
    expect(
      (await transcribePractice({ ...body, audioBase64: "a".repeat(800001) }, env, "owner")).status,
    ).toBe(400);
    expect(
      (await transcribePractice({ ...body, missionId: "invented" }, env, "owner")).status,
    ).toBe(400);
    expect(stt).toHaveBeenCalledTimes(1);
  });
});
describe("flexible activities with authoritative ground truth", () => {
  it("requires every unique matching pair; missing, duplicate, and wrong pairs do not pass", () => {
    const cards = missions[0]?.matches ?? [];
    const pairs = cards.map(({ id, english }) => ({ id, english }));
    expect(gradeMatching("basics", pairs)).toBe(true);
    expect(gradeMatching("basics", pairs.slice(1))).toBe(false);
    expect(
      gradeMatching(
        "basics",
        pairs.map(() => pairs[0]),
      ),
    ).toBe(false);
    expect(
      gradeMatching(
        "basics",
        pairs.map((pair) => ({ ...pair, english: "Wrong" })),
      ),
    ).toBe(false);
    expect(gradeMatching("basics", null)).toBe(false);
  });
  it("includes the groom lesson and sourced hype without changing old lesson IDs", () => {
    expect(
      missions
        .find((mission) => mission.id === "groom")
        ?.phrases.some((phrase) => phrase.english === "Eric is very handsome."),
    ).toBe(true);
    expect(missions.every((mission) => mission.hype?.length && mission.matches?.length)).toBe(true);
    for (const mission of missions) {
      expect(new Set(mission.matches?.map((card) => card.english)).size).toBe(
        mission.matches?.length,
      );
      for (const fact of mission.hype ?? []) {
        expect(new URL(fact.source.url).protocol).toMatch(/^https?:$/);
      }
    }
    expect(missions.find((mission) => mission.id === "wall")?.hype?.[0]?.caveat).toContain(
      "not one continuous",
    );
  });
  it("enforces atomic per-user budgets", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => takePracticeBudget(env.DB, "owner", "coach", 3)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await takePracticeBudget(env.DB, "friend", "coach", 3)).toBe(true);
  });
  it("generates real AI scenes, evaluates free text, and does not award mastery from model feedback", async () => {
    env.OPENROUTER_API_TOKEN = "test-only";
    const response = await handleCoach(
      { action: "start", missionId: "basics", focus: 0 },
      env,
      "owner",
    );
    const scene = (await response.json()) as CoachScene;
    expect(scene.source).toBe("ai");
    expect(scene.target.hanzi).toBe("你好。");
    generate.mockReturnValue(
      Effect.succeed({
        value: { correct: true, feedback: "Meaning understood. Now try nǐ hǎo out loud." },
      }),
    );
    const answer = await handleCoach(
      { action: "answer", missionId: "basics", sceneId: scene.id, answer: "Hello there" },
      env,
      "owner",
    );
    expect(((await answer.json()) as CoachReply).correct).toBe(true);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM mastery").get()?.["n"]).toBe(0);
  });
  it("protects scene ownership, expiry, turn caps, and labels provider fallback honestly", async () => {
    const scene = (await (
      await handleCoach({ action: "start", missionId: "basics", focus: 0 }, env, "owner")
    ).json()) as CoachScene;
    expect(scene.source).toBe("fallback");
    const body = { action: "answer", missionId: "basics", sceneId: scene.id, answer: "ni hao" };
    expect((await handleCoach(body, env, "someone-else")).status).toBe(404);
    for (let i = 0; i < 6; i++) {
      expect((await handleCoach(body, env, "owner")).status).toBe(200);
    }
    expect((await handleCoach(body, env, "owner")).status).toBe(409);
    sqlite.prepare("UPDATE coach_scenes SET expires_at = 0").run();
    expect((await handleCoach(body, env, "owner")).status).toBe(404);
  });
  it("never asks the LLM to invent or grade emergency numbers", async () => {
    env.OPENROUTER_API_TOKEN = "test-only";
    vi.spyOn(Math, "random").mockReturnValue(5.2 / 8);
    const scene = (await (
      await handleCoach({ action: "start", missionId: "rescue" }, env, "owner")
    ).json()) as CoachScene;
    expect(scene.target.hanzi).toBe("120");
    expect(scene.source).toBe("curated");
    const body = { action: "answer", missionId: "rescue", sceneId: scene.id };
    const wrong = (await (
      await handleCoach({ ...body, answer: "110" }, env, "owner")
    ).json()) as CoachReply;
    expect(wrong.correct).toBe(false);
    expect(wrong.feedback).toContain("120");
    const right = (await (
      await handleCoach({ ...body, answer: "120" }, env, "owner")
    ).json()) as CoachReply;
    expect(right.correct).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
});
