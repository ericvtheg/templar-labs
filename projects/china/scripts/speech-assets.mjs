import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { audioPlan, matchesHistory } from "../apps/web/src/lib/speech-artifacts.ts";
import {
  defaultMandarinVoiceId,
  mandarinModelId,
  mandarinVoiceSettings,
  speechSpeeds,
} from "../apps/web/src/lib/voice-config.ts";

const directory = new URL("../audio/", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plan = await audioPlan();
if (plan.length > 1000) {
  throw new Error("Audio catalog exceeds the reviewed 1,000-clip limit.");
}
function assertMp3(bytes) {
  if (
    bytes.length < 100 ||
    !(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))
  ) {
    throw new Error("Expected nonempty MP3 audio, not an error response.");
  }
}
async function existing(clip) {
  try {
    const bytes = await readFile(new URL(clip.key, directory));
    assertMp3(bytes);
    return bytes;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function save(clip, response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("audio/mpeg")) {
    await response.body?.cancel();
    throw new Error(`Audio download failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assertMp3(bytes);
  const destination = new URL(clip.key, directory);
  await mkdir(new URL("./", destination), { recursive: true });
  const temporary = `${fileURLToPath(destination)}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}
async function pool(items, action) {
  let cursor = 0;
  let failed = false;
  async function worker() {
    while (!failed && cursor < items.length) {
      const item = items[cursor++];
      try {
        await action(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all([worker(), worker()]);
}
function elevenKey() {
  if (process.env.CI) {
    throw new Error("ElevenLabs generation/download is local-only; CI uploads saved files.");
  }
  if (process.env.ELEVENLABS_API_TOKEN?.trim()) {
    return process.env.ELEVENLABS_API_TOKEN.trim();
  }
  let raw;
  try {
    raw = execFileSync(
      "pass-cli",
      [
        "item",
        "view",
        "--vault-name",
        "Homelab",
        "--item-title",
        "Eleven Labs API Key",
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw new Error("Cannot read the requested Proton Pass entry. Check pass-cli login/access.");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Unexpected Proton Pass response.");
  }
  const keys = [
    ...new Set(
      (data.item?.content?.extra_fields ?? [])
        .filter((field) => field.name === "API Key")
        .map((field) => field.content?.Hidden?.trim())
        .filter(Boolean),
    ),
  ];
  if (keys.length !== 1) {
    throw new Error("Expected one populated API Key field in the Proton Pass entry.");
  }
  return keys[0];
}
async function manifest() {
  const clips = [];
  for (const clip of plan) {
    const bytes = await existing(clip);
    if (bytes) {
      clips.push({ ...clip, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL("manifest.json", directory),
    `${JSON.stringify({ version: 1, voiceId: defaultMandarinVoiceId, model: mandarinModelId, clips }, null, 2)}\n`,
  );
  return clips;
}
async function check() {
  const saved = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
  if (
    saved.version !== 1 ||
    saved.voiceId !== defaultMandarinVoiceId ||
    saved.model !== mandarinModelId ||
    saved.clips?.length !== plan.length
  ) {
    throw new Error(
      "Audio manifest is incomplete or out of date. Run audio:pull or audio:generate locally.",
    );
  }
  const records = new Map(saved.clips.map((clip) => [clip.key, clip]));
  for (const clip of plan) {
    const record = records.get(clip.key);
    const bytes = await existing(clip);
    if (
      !bytes ||
      !record ||
      record.text !== clip.text ||
      record.speed !== clip.speed ||
      record.bytes !== bytes.length ||
      record.sha256 !== hash(bytes)
    ) {
      throw new Error(`Missing, outdated, or corrupt prepared audio: ${clip.key}`);
    }
  }
  return saved.clips;
}
async function prepare(mode) {
  const missing = [];
  for (const clip of plan) {
    if (!(await existing(clip))) {
      missing.push(clip);
    }
  }
  console.log(
    JSON.stringify({
      audio: {
        mode,
        total: plan.length,
        existing: plan.length - missing.length,
        missing: missing.length,
      },
    }),
  );
  if (!missing.length) {
    await manifest();
    return;
  }
  const key = elevenKey();
  const headers = { "xi-api-key": key };
  let processed = 0;
  if (mode === "pull") {
    const found = new Map();
    let last;
    for (let page = 0; page < 30; page++) {
      const params = new URLSearchParams({ page_size: "100" });
      if (last) {
        params.set("start_after_history_item_id", last);
      }
      const response = await fetch(`https://api.elevenlabs.io/v1/history?${params}`, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Cannot read ElevenLabs history: HTTP ${response.status}`);
      }
      const data = await response.json();
      for (const item of data.history ?? []) {
        for (const clip of missing) {
          if (!found.has(clip.key) && matchesHistory(item, clip)) {
            found.set(clip.key, item.history_item_id);
          }
        }
      }
      if (
        found.size === missing.length ||
        !data.has_more ||
        !data.last_history_item_id ||
        data.last_history_item_id === last
      ) {
        break;
      }
      last = data.last_history_item_id;
    }
    await pool(
      missing.filter((clip) => found.has(clip.key)),
      async (clip) => {
        await save(
          clip,
          await fetch(
            `https://api.elevenlabs.io/v1/history/${encodeURIComponent(found.get(clip.key))}/audio`,
            { headers, redirect: "error", signal: AbortSignal.timeout(60_000) },
          ),
        );
        processed++;
        if (processed % 25 === 0) {
          console.log(JSON.stringify({ downloaded: processed }));
        }
      },
    );
    await manifest();
    if (processed !== missing.length) {
      throw new Error(
        `${missing.length - processed} clips not found in recent history. Saved the rest; audio:generate explicitly generates only missing files.`,
      );
    }
  } else {
    console.log(
      JSON.stringify({
        generatingMissingClips: missing.length,
        characters: missing.reduce((count, clip) => count + [...clip.text].length, 0),
      }),
    );
    await pool(missing, async (clip) => {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${defaultMandarinVoiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            text: clip.text,
            model_id: mandarinModelId,
            language_code: "zh",
            voice_settings: {
              stability: mandarinVoiceSettings.stability,
              similarity_boost: mandarinVoiceSettings.similarityBoost,
              speed: speechSpeeds[clip.speed],
            },
          }),
        },
      );
      await save(clip, response);
      processed++;
      if (processed % 25 === 0) {
        console.log(JSON.stringify({ generated: processed }));
      }
    });
    await manifest();
  }
  console.log(
    JSON.stringify({ savedLocally: processed, generated: mode === "generate" ? processed : 0 }),
  );
}
async function upload() {
  const clips = await check();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    throw new Error("Cloudflare credentials required to upload saved audio.");
  }
  const headers = { authorization: `Bearer ${token}` };
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
  const settings = await fetch(`${base}/workers/scripts/china-website/settings`, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!settings.ok) {
    await settings.body?.cancel();
    throw new Error(`Cannot read China storage binding: HTTP ${settings.status}`);
  }
  const data = await settings.json();
  const bucket = data.result?.bindings?.find(
    (binding) => binding.name === "R2" && binding.type === "r2_bucket",
  )?.bucket_name;
  if (!bucket) {
    throw new Error("China private audio bucket binding missing.");
  }
  let uploaded = 0;
  let unchanged = 0;
  await pool(clips, async (clip) => {
    const url = `${base}/r2/buckets/${encodeURIComponent(bucket)}/objects/${clip.key}`;
    const current = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (current.ok) {
      if (hash(Buffer.from(await current.arrayBuffer())) === clip.sha256) {
        unchanged++;
        return;
      }
    } else {
      await current.body?.cancel();
      if (current.status !== 404) {
        throw new Error(`Cannot inspect stored audio: HTTP ${current.status}`);
      }
    }
    const response = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "audio/mpeg", "cf-r2-data-catalog-check": "true" },
      body: await readFile(new URL(clip.key, directory)),
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Prepared audio upload failed: HTTP ${response.status}`);
    }
    await response.body?.cancel();
    uploaded++;
  });
  console.log(
    JSON.stringify({
      preparedAudioUpload: { total: clips.length, uploaded, unchanged, elevenLabsCalls: 0 },
    }),
  );
}
try {
  const mode = process.argv[2];
  if (mode === "pull" || mode === "generate") {
    if (process.env.CI) {
      throw new Error("ElevenLabs generation/download is local-only; CI uploads saved files.");
    }
    await prepare(mode);
    await check();
  } else if (mode === "check") {
    console.log(JSON.stringify({ verifiedPreparedClips: (await check()).length }));
  } else if (mode === "upload") {
    await upload();
  } else {
    throw new Error("Usage: speech-assets.mjs pull | generate | check | upload");
  }
} catch (error) {
  // Never dump fetch options, subprocess output, or credential-bearing error objects.
  console.error(error instanceof Error ? error.message : "Audio asset command failed.");
  process.exitCode = 1;
}
