import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { audioPlan, matchesHistory } from "../src/lib/speech-artifacts.ts";
import {
  defaultMandarinVoiceId,
  mandarinModelId,
  mandarinVoiceSettings,
} from "../src/lib/voice-config.ts";

const directory = new URL("../../../audio/", import.meta.url);
const script = new URL("../../../scripts/speech-assets.mjs", import.meta.url);
describe("versioned speech artifacts", () => {
  it("ships a checksummed MP3 for every approved phrase and speed, outside public web assets", async () => {
    const plan = await audioPlan();
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8")) as {
      voiceId: string;
      model: string;
      clips: { key: string; text: string; speed: string; sha256: string; bytes: number }[];
    };
    expect(manifest.voiceId).toBe(defaultMandarinVoiceId);
    expect(manifest.model).toBe(mandarinModelId);
    expect(manifest.clips).toHaveLength(plan.length);
    expect(new Set(plan.map((clip) => clip.key)).size).toBe(plan.length);
    for (const clip of plan) {
      const saved = manifest.clips.find((entry) => entry.key === clip.key);
      const bytes = readFileSync(new URL(clip.key, directory));
      expect(saved).toMatchObject({
        ...clip,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(bytes.length).toBeGreaterThan(100);
      expect(
        bytes.subarray(0, 3).toString() === "ID3" ||
          (bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224),
      ).toBe(true);
    }
  });
  it("reuses only matching history, not another voice, speed, or unrelated account text", async () => {
    const clip = (await audioPlan())[0];
    if (!clip) {
      throw new Error("Missing audio plan");
    }
    const item = {
      history_item_id: "test-history",
      text: clip.text,
      voice_id: defaultMandarinVoiceId,
      model_id: mandarinModelId,
      settings: {
        speed: 1,
        stability: mandarinVoiceSettings.stability,
        similarity_boost: mandarinVoiceSettings.similarityBoost,
      },
    };
    expect(matchesHistory(item, clip)).toBe(true);
    expect(matchesHistory({ ...item, voice_id: "another-voice" }, clip)).toBe(false);
    expect(matchesHistory({ ...item, text: "unrelated audio" }, clip)).toBe(false);
    expect(matchesHistory({ ...item, settings: { ...item.settings, speed: 0.75 } }, clip)).toBe(
      false,
    );
    expect(matchesHistory({ ...item, settings: { ...item.settings, style: 0.5 } }, clip)).toBe(
      false,
    );
  });
  it("refuses ElevenLabs generation in CI", () => {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", fileURLToPath(script), "generate"],
      { encoding: "utf8", env: { ...process.env, CI: "true" } },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("local-only");
  });
  it("CI uploads require only Cloudflare credentials, not Proton Pass or ElevenLabs", () => {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", fileURLToPath(script), "upload"],
      { encoding: "utf8", env: { CI: "true", PATH: process.env["PATH"] } },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cloudflare credentials required");
  });
});
