import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { missions } from "./curriculum.ts";
import { takePracticeBudget } from "./practice-budget.server.ts";
import type { TripBody } from "./trip-body.ts";
import type { VoiceBindings } from "./voice.server.ts";

const fail = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { "cache-control": "private, no-store", vary: "Cookie" } },
  );
export async function transcribePractice(body: TripBody, env: VoiceBindings, userId: string) {
  if (
    !missions.some((mission) => mission.id === body.missionId) ||
    typeof body.audioBase64 !== "string" ||
    body.audioBase64.length > 800_000 ||
    typeof body.contentType !== "string" ||
    !["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"].includes(
      body.contentType.split(";")[0] ?? "",
    )
  ) {
    return fail("Use a short recording from a lesson (20 seconds or less).", 400);
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(body.audioBase64), (char) => char.charCodeAt(0));
  } catch {
    return fail("Invalid audio encoding.", 400);
  }
  if (!bytes.byteLength) {
    return fail("The recording was empty.", 400);
  }
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    return fail("Speech transcription is not configured. You can answer in text.", 503);
  }
  if (!(await takePracticeBudget(env.DB, userId, "transcribe", 40))) {
    return fail(
      "You’ve used this hour’s 40 voice checks. Keep practicing in text, or try voice again next hour.",
      429,
    );
  }
  try {
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const suffix = body.contentType.startsWith("audio/mp4")
      ? "mp4"
      : body.contentType.startsWith("audio/mpeg")
        ? "mp3"
        : body.contentType.split("/")[1]?.split(";")[0];
    const result = await client.speechToText.convert(
      {
        file: new File([new Uint8Array(bytes)], `practice.${suffix}`, { type: body.contentType }),
        modelId: "scribe_v2",
        languageCode: "zho",
        tagAudioEvents: false,
      },
      { timeoutInSeconds: 25, maxRetries: 0 },
    );
    return Response.json(
      { text: result.text },
      { headers: { "cache-control": "private, no-store", vary: "Cookie" } },
    );
  } catch {
    return fail(
      "Transcription is unavailable right now. Your local recording still works; you can type your answer instead.",
      503,
    );
  }
}
