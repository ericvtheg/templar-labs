import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { templarBindings } from "../../../../templar-bindings.ts";
import { type VoiceModelRoute, voiceModelRoutes } from "./voice-models.ts";

const fallbackVoiceId = "JBFqnCBsd6RMkjVDRZzb";

type VoiceEnv = {
  readonly [templarBindings.elevenLabsApiKey]: string;
  readonly [templarBindings.elevenLabsVoiceId]?: string;
};

export type SpeechAudio = {
  readonly audioBase64: string;
  readonly contentType: string;
  readonly voiceId: string;
  readonly modelRoute: VoiceModelRoute;
  readonly modelId: string;
};

export type SpeechTranscript = {
  readonly text: string;
  readonly languageCode: string | null;
  readonly modelId: string;
};

export async function synthesizeSpeech(input: {
  readonly text: string;
  readonly route: VoiceModelRoute;
}): Promise<SpeechAudio> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as VoiceEnv;
  const apiKey = bindings[templarBindings.elevenLabsApiKey];
  const voiceId = bindings[templarBindings.elevenLabsVoiceId] ?? fallbackVoiceId;
  const modelId = voiceModelRoutes[input.route];

  if (apiKey.trim().length === 0) {
    throw new Error("ElevenLabs is not configured.");
  }

  const elevenLabs = new ElevenLabsClient({
    apiKey,
  });
  const audio = await elevenLabs.textToSpeech.convert(voiceId, {
    text: input.text,
    modelId,
    languageCode: "sv",
    outputFormat: "mp3_44100_128",
  });

  return {
    audioBase64: await streamToBase64(audio),
    contentType: "audio/mpeg",
    voiceId,
    modelRoute: input.route,
    modelId,
  };
}

export async function transcribeSpeech(input: {
  readonly audioBase64: string;
  readonly contentType: string;
}): Promise<SpeechTranscript> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as VoiceEnv;
  const apiKey = bindings[templarBindings.elevenLabsApiKey];

  if (apiKey.trim().length === 0) {
    throw new Error("ElevenLabs is not configured.");
  }

  const elevenLabs = new ElevenLabsClient({
    apiKey,
  });
  const bytes = base64ToUint8Array(input.audioBase64);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const file = new File([arrayBuffer], "learner-audio.webm", {
    type: input.contentType,
  });
  const modelId = "scribe_v2";
  const result = await elevenLabs.speechToText.convert({
    file,
    modelId,
    languageCode: "sv",
    tagAudioEvents: false,
  });

  return {
    text: result.text,
    languageCode: result.languageCode ?? null,
    modelId,
  };
}

async function streamToBase64(stream: ReadableStream<Uint8Array>): Promise<string> {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return uint8ArrayToBase64(bytes);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
