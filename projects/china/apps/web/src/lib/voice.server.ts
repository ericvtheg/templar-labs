import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { speechCacheKey } from "./speech-cache.ts";

export { speechCacheKey } from "./speech-cache.ts";

import { approvedSpeechTexts } from "./speech-catalog.ts";
import {
  defaultMandarinVoiceId,
  mandarinModelId,
  mandarinVoiceSettings,
  speechSpeeds,
} from "./voice-config.ts";

export type VoiceBindings = {
  readonly ELEVENLABS_API_KEY?: string;
  readonly R2?: R2Bucket;
  readonly DB: D1Database;
};
const allowedTexts = new Set(approvedSpeechTexts);
const headers = {
  "content-type": "audio/mpeg",
  "x-china-audio-cache": "HIT",
  "cache-control": "private, no-store",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};
function error(message: string, status: number, retryAfter?: string) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie",
        ...(retryAfter ? { "retry-after": retryAfter } : {}),
      },
    },
  );
}
async function audioResponse(body: BodyInit, request: Request, cache: "HIT" | "MISS") {
  const bytes = await new Response(body).arrayBuffer();
  const responseHeaders = new Headers({
    ...headers,
    "x-china-audio-cache": cache,
    "accept-ranges": "bytes",
    "content-length": String(bytes.byteLength),
  });
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const first = range[1] ?? "";
    const last = range[2] ?? "";
    const start = first ? Number(first) : Math.max(0, bytes.byteLength - Number(last));
    const end = first && last ? Math.min(Number(last), bytes.byteLength - 1) : bytes.byteLength - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= bytes.byteLength
    ) {
      responseHeaders.set("content-range", `bytes */${bytes.byteLength}`);
      responseHeaders.set("content-length", "0");
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    responseHeaders.set("content-range", `bytes ${start}-${end}/${bytes.byteLength}`);
    responseHeaders.set("content-length", String(end - start + 1));
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: responseHeaders });
  }
  return new Response(bytes, { headers: responseHeaders });
}
// Called only after the trip API's verified-owner/crew authorization check.
export async function serveSpeech(request: Request, env: VoiceBindings): Promise<Response> {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "";
  const speed = url.searchParams.get("speed") ?? "normal";
  if (!allowedTexts.has(text) || (speed !== "normal" && speed !== "slow")) {
    return error("Only approved lesson phrases and speech speeds can be generated.", 400);
  }
  const bucket = env.R2;
  if (!bucket) {
    return error("Speech storage is not configured.", 503);
  }
  const voiceId = defaultMandarinVoiceId;
  const key = await speechCacheKey(text, speed, voiceId);
  const cached = await bucket.get(key);
  if (cached) {
    return audioResponse(cached.body, request, "HIT");
  }
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    return error("ElevenLabs is not configured.", 503);
  }

  // One generation per clip across Workers/regions. Neither concurrency nor arbitrary query
  // strings can fan out paid calls; only this finite curated catalog is eligible.
  const token = crypto.randomUUID();
  const now = Date.now();
  const lease = await env.DB.prepare(
    "INSERT INTO speech_jobs (cache_key, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE speech_jobs.expires_at <= ? RETURNING token",
  )
    .bind(key, token, now + 60_000, now)
    .first<{ token: string }>();
  if (!lease) {
    // Give another crew member's in-flight generation a short head start.
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const ready = await bucket.get(key);
      if (ready) {
        return audioResponse(ready.body, request, "HIT");
      }
    }
    return error("This phrase is being prepared. Try Listen again in a moment.", 503, "2");
  }
  try {
    const ready = await bucket.get(key);
    if (ready) {
      return audioResponse(ready.body, request, "HIT");
    }
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const audio = await client.textToSpeech.convert(
      voiceId,
      {
        text,
        modelId: mandarinModelId,
        languageCode: "zh",
        outputFormat: "mp3_44100_128",
        voiceSettings: { ...mandarinVoiceSettings, speed: speechSpeeds[speed] },
      },
      { timeoutInSeconds: 25, maxRetries: 0 },
    );
    const bytes = await new Response(audio).arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error("Empty speech output");
    }
    await bucket.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    return audioResponse(bytes, request, "MISS");
  } catch (cause) {
    // Don't expose provider responses, the API key, or any account details to the browser/logs.
    const status =
      cause && typeof cause === "object" && "statusCode" in cause ? cause.statusCode : undefined;
    console.error(
      "Mandarin speech generation failed",
      typeof status === "number" ? status : "provider-or-storage",
    );
    return error(
      "ElevenLabs speech is temporarily unavailable. Try again or use the optional device voice.",
      503,
      "5",
    );
  } finally {
    await env.DB.prepare("DELETE FROM speech_jobs WHERE cache_key = ? AND token = ?")
      .bind(key, token)
      .run();
  }
}
