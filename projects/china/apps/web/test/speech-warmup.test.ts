import { describe, expect, it, vi } from "vitest";
import { approvedSpeechTexts } from "../src/lib/speech-catalog.ts";
import { warmSpeech } from "../src/lib/speech-warmup.ts";

describe("deployment speech pre-generation", () => {
  it("visits every curated clip at both speeds, bounded to two concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const seen = new Set<string>();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, options) => {
      active++;
      peak = Math.max(peak, active);
      const url = new URL(String(input));
      expect(options?.headers).toEqual({ cookie: "test-session" });
      expect(options?.redirect).toBe("error");
      expect(approvedSpeechTexts).toContain(url.searchParams.get("text"));
      expect(["normal", "slow"]).toContain(url.searchParams.get("speed"));
      expect(seen.has(url.search)).toBe(false);
      seen.add(url.search);
      await Promise.resolve();
      active--;
      return new Response(new Uint8Array([1, 2]), {
        headers: { "content-type": "audio/mpeg", "x-china-audio-cache": "HIT" },
      });
    });
    const result = await warmSpeech({
      origin: "https://china.example",
      session: "test-session",
      fetcher,
    });
    expect(result).toEqual({
      total: approvedSpeechTexts.length * 2,
      cached: approvedSpeechTexts.length * 2,
      generated: 0,
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
  it("reports actual newly generated clips separately from existing cached audio", async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-type": "audio/mpeg",
            "x-china-audio-cache": ++count === 1 ? "MISS" : "HIT",
          },
        }),
    );
    const result = await warmSpeech({
      origin: "https://china.example",
      session: "test-session",
      fetcher,
    });
    expect(result.generated).toBe(1);
    expect(result.cached).toBe(result.total - 1);
  });
  it("stops on authorization failure instead of continuing a paid batch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null, { status: 401 }));
    await expect(
      warmSpeech({ origin: "https://china.example", session: "test-session", fetcher }),
    ).rejects.toThrow("HTTP 401");
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
