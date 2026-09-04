import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/lib/audio";
import { moveNotes, pasteNotes, replaceNotes, resizeNotes } from "../src/lib/editing";
import { demoSession, makeTrack, notesAtStep, sessionSchema } from "../src/lib/session";

const notes = [
  { step: 2, pitch: 60, duration: 2, velocity: 0.8 },
  { step: 6, pitch: 67, duration: 4, velocity: 0.6 },
];
describe("musical editing", () => {
  it("preserves timing and pitch intervals when a group hits the grid boundaries", () => {
    const moved = moveNotes(notes, 15, 40, 16);
    expect(moved.map((n) => [n.step, n.pitch])).toEqual([
      [8, 89],
      [12, 96],
    ]);
    expect(moveNotes(notes, -10, -60, 16).map((n) => [n.step, n.pitch])).toEqual([
      [0, 24],
      [4, 31],
    ]);
    expect(notes[0]?.step).toBe(2);
  });
  it("resizes to half-step precision without crossing the pattern end", () => {
    expect(resizeNotes(notes, -8, 16, 0.5).map((n) => n.duration)).toEqual([0.5, 0.5]);
    expect(resizeNotes(notes, 20, 16, 0.5).map((n) => n.duration)).toEqual([14, 10]);
    expect(
      resizeNotes([{ step: 15.5, pitch: 60, duration: 0.5, velocity: 0.8 }], 1, 16, 1)[0]?.duration,
    ).toBe(0.5);
  });
  it("extends pasted phrases and replaces collisions without duplicate notes", () => {
    const track = { ...makeTrack("synth-keys-0", 0), notes };
    const pasted = pasteNotes(track, notes, 15.5);
    expect(pasted.track.length).toBe(32);
    expect(pasted.pasted.map((n) => n.step)).toEqual([15.5, 19.5]);
    expect(replaceNotes(track, [], notes).notes).toHaveLength(2);
    expect(pasteNotes(track, notes, 63.5).pasted).toEqual([
      { ...notes[0], step: 63.5, duration: 0.5 },
    ]);
  });
  it("schedules off-grid notes in the right bucket and keeps trimmed clip phase", () => {
    const track = makeTrack("synth-keys-0", 0);
    track.length = 32;
    track.notes = [{ step: 16.5, pitch: 60, duration: 0.5, velocity: 0.8 }];
    track.clips = [{ id: "trim", start: 1, bars: 1, offset: 16 }];
    expect(notesAtStep(track, 16)).toEqual(track.notes);
    expect(notesAtStep(track, 17)).toEqual([]);
    expect(sessionSchema.safeParse({ ...demoSession(), tracks: [track] }).success).toBe(true);
  });
  it("wraps playback within the selected region including fractional playhead positions", () => {
    const session = { ...demoSession(), loop: { start: 2, end: 4 } };
    const engine = new AudioEngine(session);
    expect(engine.mapStep(63.5)).toBe(63.5);
    expect(engine.mapStep(64)).toBe(32);
    expect(engine.mapStep(98.5)).toBe(34.5);
    engine.loop = false;
    expect(engine.mapStep(64)).toBe(64);
    expect(sessionSchema.safeParse({ ...session, loop: { start: 4, end: 2 } }).success).toBe(false);
  });
});
