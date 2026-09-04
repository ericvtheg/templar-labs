import { z } from "zod";
import { colors, soundById, sounds } from "./catalog";

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
const effectSchema = z.object({ enabled: z.boolean(), value: finite(0, 1) });
const patternLength = z.union([z.literal(16), z.literal(32), z.literal(64)]);
const noteList = z
  .array(
    z.object({
      step: z.number().multipleOf(0.5).min(0).max(63.5),
      pitch: z.number().int().min(24).max(96),
      duration: z.number().multipleOf(0.5).min(0.5).max(64),
      velocity: finite(0.05, 1),
    }),
  )
  .max(512);
const patternSchema = z
  .object({ length: patternLength, notes: noteList })
  .refine(
    (pattern) =>
      pattern.notes.every((note) => note.step + note.duration <= pattern.length) &&
      new Set(pattern.notes.map((note) => `${note.step}-${note.pitch}`)).size ===
        pattern.notes.length,
    "Invalid clip pattern",
  );
export const sessionSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(80),
    bpm: finite(50, 200),
    swing: finite(0, 0.45),
    bars: z.number().int().min(4).max(64),
    master: finite(0, 1),
    loop: z
      .object({ start: z.number().int().min(0).max(63), end: z.number().int().min(1).max(64) })
      .optional(),
    tracks: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          name: z.string().min(1).max(50),
          sound: z.string().refine((id) => sounds.some((s) => s.id === id)),
          color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
          volume: finite(0, 1),
          pan: finite(-1, 1),
          muted: z.boolean(),
          solo: z.boolean(),
          length: patternLength,
          notes: noteList,
          clips: z
            .array(
              z.object({
                id: z.string().min(1).max(100),
                start: z.number().int().min(0).max(63),
                bars: z.number().int().min(1).max(64),
                pattern: patternSchema.optional(),
                offset: z.number().int().min(0).max(63).optional(),
              }),
            )
            .max(64),
          effects: z.object({
            filter: effectSchema,
            drive: effectSchema,
            delay: effectSchema,
            reverb: effectSchema,
            compressor: effectSchema,
          }),
        }),
      )
      .min(1)
      .max(24),
  })
  .superRefine((session, context) => {
    if (
      session.loop &&
      (session.loop.start >= session.loop.end || session.loop.end > session.bars)
    ) {
      context.addIssue({ code: "custom", message: "Invalid loop region" });
    }
    const ids = new Set<string>();
    for (const track of session.tracks) {
      if (
        ids.has(track.id) ||
        track.notes.some((note) => note.step + note.duration > track.length) ||
        new Set(track.notes.map((note) => `${note.step}-${note.pitch}`)).size !==
          track.notes.length ||
        new Set(track.clips.map((clip) => clip.id)).size !== track.clips.length ||
        track.clips.some(
          (clip) =>
            clip.start + clip.bars > session.bars ||
            track.clips.some(
              (other) =>
                other !== clip &&
                clip.start < other.start + other.bars &&
                clip.start + clip.bars > other.start,
            ),
        )
      ) {
        context.addIssue({ code: "custom", message: "Invalid track or arrangement" });
      }
      ids.add(track.id);
    }
  });
export type Session = z.infer<typeof sessionSchema>;
export type Track = Session["tracks"][number];
export type Note = Track["notes"][number];
export type Clip = Track["clips"][number];
export const uid = () => globalThis.crypto.randomUUID();
export function makeTrack(sound: string, index: number): Track {
  return {
    id: uid(),
    name: soundById(sound).name,
    sound,
    color: colors[index % colors.length] ?? "#d3a87c",
    volume: 0.7,
    pan: 0,
    muted: false,
    solo: false,
    length: 16,
    notes: [],
    clips: [{ id: uid(), start: 0, bars: 4 }],
    effects: {
      filter: { enabled: false, value: 0.8 },
      drive: { enabled: false, value: 0.2 },
      delay: { enabled: false, value: 0.22 },
      reverb: { enabled: false, value: 0.2 },
      compressor: { enabled: false, value: 0.4 },
    },
  };
}
export const demos = [
  {
    id: 0,
    name: "Afterglow",
    genre: "DOWNTEMPO / 108 BPM",
    description: "Warm chords. A dusty groove. Room to wander.",
    color: "#e1a273",
  },
  {
    id: 1,
    name: "Night Transit",
    genre: "HOUSE / 124 BPM",
    description: "A late-night pulse with a little neon in its veins.",
    color: "#aa9ad9",
  },
  {
    id: 2,
    name: "Soft Focus",
    genre: "LO-FI / 82 BPM",
    description: "Unhurried drums and keys that feel like home.",
    color: "#87b5a0",
  },
];
export function demoSession(index = 0): Session {
  const demo = demos[index] ?? demos[0]!;
  const house = index === 1;
  const tracks = [
    "sample-0-1",
    "sample-1-2",
    "sample-3-3",
    "sample-5-0",
    "synth-bass-0",
    "synth-keys-0",
    "synth-pad-0",
    "synth-pluck-0",
  ].map(makeTrack);
  const names = [
    "Deep Kick",
    "Dusty Snare",
    "Tight Hats",
    "Percussion",
    "Sub Foundation",
    "Velvet Keys",
    "Cloud Nine",
    "Daylight Pluck",
  ];
  const drumSteps = [
    house ? [0, 4, 8, 12] : [0, 6, 8, 14],
    [4, 12],
    house ? [2, 6, 10, 14] : [0, 2, 4, 6, 8, 10, 12, 14],
    [3, 10, 15],
  ];
  const roots = [45, 41, 48, 43];
  tracks.forEach((track, i) => {
    track.id = `demo-${index}-${i}`;
    track.name = names[i] ?? track.name;
    track.volume = [0.8, 0.58, 0.36, 0.32, 0.66, 0.44, 0.22, 0.35][i] ?? 0.5;
    track.pan = [0, 0, 0.2, -0.32, 0, -0.12, 0.1, 0.22][i] ?? 0;
    track.clips = Array.from({ length: i === 7 ? 2 : i === 6 ? 3 : 4 }, (_, j) => ({
      id: `clip-${i}-${j}`,
      start: (j + (i === 7 ? 2 : i === 6 ? 1 : 0)) * 4,
      bars: 4,
    }));
    if (i < 4) {
      track.notes = (drumSteps[i] ?? []).map((step, n) => ({
        step,
        pitch: 60,
        duration: 1,
        velocity: i === 2 ? (n % 2 ? 0.48 : 0.8) : 0.82,
      }));
    } else {
      track.length = 64;
      roots.forEach((root, bar) => {
        if (i === 4) {
          for (const step of [0, 6, 10]) {
            track.notes.push({
              step: bar * 16 + step,
              pitch: root - 12,
              duration: step === 0 ? 5 : 3,
              velocity: 0.8,
            });
          }
        } else if (i === 5 || i === 6) {
          for (const offset of [0, 3, 7, 10]) {
            track.notes.push({
              step: bar * 16,
              pitch: root + 12 + offset,
              duration: i === 5 ? 10 : 15,
              velocity: 0.6,
            });
          }
        } else {
          for (const [n, offset] of [12, 19, 15, 22].entries()) {
            track.notes.push({
              step: bar * 16 + n * 4 + 2,
              pitch: root + offset,
              duration: 2,
              velocity: 0.6 + n * 0.06,
            });
          }
        }
      });
      track.effects.reverb.enabled = i > 4;
      track.effects.reverb.value = i === 6 ? 0.38 : 0.18;
      track.effects.delay.enabled = i === 7;
    }
  });
  if (index === 2) {
    tracks[5]!.sound = "synth-keys-1";
    tracks[0]!.sound = "sample-0-6";
  }
  if (house) {
    tracks[1]!.sound = "sample-2-0";
    tracks[4]!.sound = "synth-bass-1";
  }
  return {
    version: 1,
    name: demo.name,
    bpm: [108, 124, 82][index] ?? 108,
    swing: house ? 0 : 0.12,
    bars: 16,
    master: 0.8,
    tracks,
  };
}
export function notesAtStep(track: Track, step: number): Note[] {
  const clip = track.clips.find(
    (item) => step >= item.start * 16 && step < (item.start + item.bars) * 16,
  );
  if (!clip) {
    return [];
  }
  const pattern = clip.pattern ?? track;
  const local = (step - clip.start * 16 + (clip.offset ?? 0)) % pattern.length;
  return pattern.notes.filter((note) => Math.floor(note.step) === local);
}
export function toggleNote(
  track: Track,
  step: number,
  pitch: number,
  duration = 1,
  velocity = 0.8,
): Track {
  const exists = track.notes.some((note) => note.step === step && note.pitch === pitch);
  return {
    ...track,
    notes: exists
      ? track.notes.filter((note) => note.step !== step || note.pitch !== pitch)
      : [
          ...track.notes,
          { step, pitch, duration: Math.min(duration, track.length - step), velocity },
        ],
  };
}
export function moveClip(track: Track, id: string, start: number, totalBars: number): Track {
  const clip = track.clips.find((c) => c.id === id);
  if (
    !clip ||
    start < 0 ||
    start + clip.bars > totalBars ||
    track.clips.some((c) => c.id !== id && start < c.start + c.bars && start + clip.bars > c.start)
  ) {
    return track;
  }
  return { ...track, clips: track.clips.map((c) => (c.id === id ? { ...c, start } : c)) };
}
export async function encodeSession(session: Session): Promise<string> {
  const stream = new Blob([JSON.stringify(session)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function decodeSession(encoded: string): Promise<Session> {
  if (encoded.length > 100_000) {
    throw new Error("This session link is too large.");
  }
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new Error("This session is too large.");
    }
    chunks.push(value);
  }
  return sessionSchema.parse(JSON.parse(await new Blob(chunks as BlobPart[]).text()));
}
