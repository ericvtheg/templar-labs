import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wavBytes } from "../src/lib/audio";
import { presets, samples } from "../src/lib/catalog";
import {
  decodeSession,
  demoSession,
  encodeSession,
  makeTrack,
  moveClip,
  notesAtStep,
  sessionSchema,
  toggleNote,
} from "../src/lib/session";

describe("ready-to-play sessions", () => {
  it.each([0, 1, 2])("demo %i has a valid, fully arranged instrument and drum mix", (index) => {
    const session = demoSession(index);
    expect(sessionSchema.safeParse(session).success).toBe(true);
    expect(session.tracks).toHaveLength(8);
    for (const track of session.tracks) {
      expect(track.notes.length).toBeGreaterThan(0);
      expect(track.clips.length).toBeGreaterThan(0);
    }
  });
  it("ships every sample as a playable, non-silent PCM file", () => {
    expect(samples).toHaveLength(64);
    expect(presets).toHaveLength(24);
    for (const sample of samples) {
      const bytes = readFileSync(new URL(`../public${sample.url}`, import.meta.url));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.readUInt16LE(22)).toBe(1);
      expect(bytes.readUInt32LE(24)).toBe(22050);
      expect(bytes.length).toBeGreaterThan(1000);
      expect(bytes.subarray(44).some((value) => value !== 0)).toBe(true);
    }
  });
});
describe("arrangement editing", () => {
  it("repeats a pattern relative to each clip and stays silent in gaps", () => {
    const track = makeTrack("sample-0-0", 0);
    track.clips = [{ id: "a", start: 2, bars: 2 }];
    track.notes = [{ step: 0, pitch: 60, duration: 1, velocity: 0.8 }];
    expect(notesAtStep(track, 0)).toEqual([]);
    expect(notesAtStep(track, 32)).toHaveLength(1);
    expect(notesAtStep(track, 48)).toHaveLength(1);
    expect(notesAtStep(track, 64)).toEqual([]);
  });
  it("adds and erases notes without affecting other pitches", () => {
    const track = makeTrack("synth-keys-0", 0);
    const a = toggleNote(track, 15, 60, 8);
    expect(a.notes[0]?.duration).toBe(1);
    const chord = toggleNote(a, 15, 64);
    expect(chord.notes).toHaveLength(2);
    expect(toggleNote(chord, 15, 60).notes.map((n) => n.pitch)).toEqual([64]);
  });
  it("rejects overlapping and out-of-bounds clip moves", () => {
    const track = makeTrack("sample-0-0", 0);
    track.clips = [
      { id: "a", start: 0, bars: 4 },
      { id: "b", start: 8, bars: 4 },
    ];
    expect(moveClip(track, "a", 6, 16)).toBe(track);
    expect(moveClip(track, "a", 14, 16)).toBe(track);
    expect(moveClip(track, "a", -1, 16)).toBe(track);
    expect(moveClip(track, "a", 4, 16).clips[0]?.start).toBe(4);
  });
});
describe("portable sessions", () => {
  it("round-trips the complete session including notes, effects and mixer", async () => {
    const session = demoSession();
    session.name = "A shared idea 🎹";
    const encoded = await encodeSession(session);
    expect(encoded.length).toBeLessThan(15000);
    expect(await decodeSession(encoded)).toEqual(session);
  });
  it("rejects invalid sounds, unsafe parameter ranges, duplicate tracks and missing tracks", () => {
    const session = demoSession();
    expect(sessionSchema.safeParse({ ...session, bpm: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    );
    expect(sessionSchema.safeParse({ ...session, tracks: [] }).success).toBe(false);
    expect(
      sessionSchema.safeParse({ ...session, tracks: [session.tracks[0], session.tracks[0]] })
        .success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({
        ...session,
        tracks: [{ ...session.tracks[0], sound: "https://untrusted.example/audio" }],
      }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({ ...session, tracks: [{ ...session.tracks[0], volume: 10 }] })
        .success,
    ).toBe(false);
  });
  it("rejects damaged or oversized shared payloads", async () => {
    await expect(decodeSession("broken-link")).rejects.toThrow();
    await expect(decodeSession("a".repeat(100001))).rejects.toThrow("too large");
  });
});
it("writes stereo 16-bit WAV with correct sample interleaving and saturation", () => {
  const left = new Float32Array([0, 0.5, -2]);
  const right = new Float32Array([1, -0.5, 2]);
  const bytes = wavBytes({
    length: 3,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: (c) => (c === 0 ? left : right),
  });
  const view = new DataView(bytes);
  expect(bytes.byteLength).toBe(56);
  expect(view.getUint16(22, true)).toBe(2);
  expect(view.getUint32(24, true)).toBe(44100);
  expect(view.getUint32(40, true)).toBe(12);
  expect([44, 46, 48, 50, 52, 54].map((i) => view.getInt16(i, true))).toEqual([
    0, 32767, 16383, -16384, -32768, 32767,
  ]);
});
