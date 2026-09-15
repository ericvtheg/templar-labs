import { approvedSpeechTexts } from "./speech-catalog.ts";
import { speechSpeeds } from "./voice-config.ts";
export type WarmupStats = { total: number; cached: number; generated: number };
export async function warmSpeech({
  origin,
  session,
  fetcher = fetch,
  onProgress,
}: {
  origin: string;
  session: string;
  fetcher?: typeof fetch;
  onProgress?: (stats: WarmupStats) => void;
}): Promise<WarmupStats> {
  const clips = approvedSpeechTexts.flatMap((text) =>
    Object.keys(speechSpeeds).map((speed) => ({ text, speed })),
  );
  if (clips.length > 1000) {
    throw new Error("Speech catalog exceeds the reviewed warmup limit.");
  }
  const stats: WarmupStats = { total: clips.length, cached: 0, generated: 0 };
  let cursor = 0;
  const stop = new AbortController();
  async function worker() {
    while (cursor < clips.length && !stop.signal.aborted) {
      const index = cursor++;
      const clip = clips[index];
      if (!clip) {
        return;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetcher(`${origin}/api/trip/speech?${new URLSearchParams(clip)}`, {
          headers: { cookie: session },
          redirect: "error",
          signal: AbortSignal.any([stop.signal, AbortSignal.timeout(60_000)]),
        });
        if ((response.status === 429 || response.status === 503) && attempt < 2) {
          await response.body?.cancel();
          const delay = Math.min(30, Math.max(1, Number(response.headers.get("retry-after")) || 5));
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));
          continue;
        }
        const cache = response.headers.get("x-china-audio-cache");
        if (
          response.status !== 200 ||
          !response.headers.get("content-type")?.includes("audio/mpeg") ||
          (cache !== "HIT" && cache !== "MISS")
        ) {
          await response.body?.cancel();
          throw new Error(
            `Speech warmup failed at clip ${index + 1}: HTTP ${response.status}. Completed ${stats.cached + stats.generated}/${stats.total}.`,
          );
        }
        if ((await response.arrayBuffer()).byteLength === 0) {
          throw new Error(`Empty audio at clip ${index + 1}.`);
        }
        if (cache === "HIT") {
          stats.cached++;
        } else {
          stats.generated++;
        }
        if ((stats.cached + stats.generated) % 10 === 0) {
          onProgress?.({ ...stats });
        }
        break;
      }
    }
  }
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    stop.abort();
  }
  return stats;
}
