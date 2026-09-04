import type { Note, Track } from "./session";

export const noteKey = (note: Note) => `${note.step}:${note.pitch}`;
export const snap = (value: number, grid: number) => Math.round(value / grid) * grid;
export function replaceNotes(track: Track, originals: Note[], replacements: Note[]): Track {
  const removed = new Set(originals.map(noteKey));
  const inserted = new Set(replacements.map(noteKey));
  return {
    ...track,
    notes: [
      ...track.notes.filter((note) => !removed.has(noteKey(note)) && !inserted.has(noteKey(note))),
      ...replacements,
    ],
  };
}
export function moveNotes(
  notes: Note[],
  stepDelta: number,
  pitchDelta: number,
  length: number,
): Note[] {
  if (!notes.length) {
    return [];
  }
  const left = Math.min(...notes.map((note) => note.step));
  const right = Math.max(...notes.map((note) => note.step + note.duration));
  const low = Math.min(...notes.map((note) => note.pitch));
  const high = Math.max(...notes.map((note) => note.pitch));
  const dx = Math.max(-left, Math.min(length - right, stepDelta));
  const dy = Math.max(24 - low, Math.min(96 - high, pitchDelta));
  return notes.map((note) => ({ ...note, step: note.step + dx, pitch: note.pitch + dy }));
}
export function resizeNotes(notes: Note[], delta: number, length: number, grid: number): Note[] {
  return notes.map((note) => ({
    ...note,
    duration: Math.min(length - note.step, Math.max(grid, note.duration + delta)),
  }));
}
export function pasteNotes(
  track: Track,
  notes: Note[],
  at: number,
): { track: Track; pasted: Note[] } {
  if (!notes.length) {
    return { track, pasted: [] };
  }
  const start = Math.min(...notes.map((note) => note.step));
  const pasted = notes
    .map((note) => ({ ...note, step: note.step - start + at }))
    .filter((note) => note.step < 64)
    .map((note) => ({ ...note, duration: Math.min(note.duration, 64 - note.step) }));
  const end = Math.max(track.length, ...pasted.map((note) => note.step + note.duration));
  const length = (end <= 16 ? 16 : end <= 32 ? 32 : 64) as Track["length"];
  return { track: replaceNotes({ ...track, length }, [], pasted), pasted };
}
