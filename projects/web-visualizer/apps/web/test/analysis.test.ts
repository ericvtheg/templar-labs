import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeChannels, chapterAt, formatTime, validateFile } from "../src/analysis.ts";

test("silence and empty audio produce finite, silent waveforms", () => {
  for (const channels of [[], [new Float32Array(12000)]]) {
    const analysis = analyzeChannels(channels);
    assert.equal(analysis.waveform.length, 240);
    assert.ok(analysis.waveform.every((value) => value === 0));
    assert.ok(analysis.energy.every((value) => value === 0));
  }
});

test("stereo analysis preserves opposite-phase audio and normalizes peaks", () => {
  const left = Float32Array.from({ length: 24000 }, (_, i) => Math.sin(i * 0.2) * 0.5);
  const right = left.map((sample) => -sample);
  const analysis = analyzeChannels([left, right]);
  assert.ok(analysis.energy.every((value) => value > 0.9));
  assert.ok(analysis.waveform.every((value) => value > 0.99 && value <= 1));
});

test("the ascension follows a sustained peak while chapters cover the full track", () => {
  const samples = Float32Array.from({ length: 24000 }, (_, i) => {
    const amplitude = i > 16800 && i < 18500 ? 0.8 : 0.1;
    return Math.sin(i * 0.7) * amplitude;
  });
  const { chapters } = analyzeChannels([samples]);
  assert.equal(chapters.length, 5);
  assert.ok((chapters[3]?.start ?? 0) >= 0.7);
  assert.ok((chapters[3]?.start ?? 1) < 0.8);
  assert.equal(chapterAt(chapters, 0), 0);
  assert.equal(chapterAt(chapters, 0.36), 2);
  assert.equal(chapterAt(chapters, 1), 4);
  assert.ok(
    chapters.every((chapter, i) => i === 0 || chapter.start > (chapters[i - 1]?.start ?? 0)),
  );
});

test("very short audio has a bounded waveform", () => {
  const { waveform, energy } = analyzeChannels([new Float32Array([0.3, -0.9, 0.1])]);
  assert.ok(
    [...waveform, ...energy].every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
  );
  assert.equal(Math.max(...waveform), 1);
});

test("file validation accepts MP3/WAV, rejects empty, unrelated, and oversized files", () => {
  assert.equal(validateFile({ name: "Mix.WAV", size: 1024 }), null);
  assert.equal(validateFile({ name: "demo.mp3", size: 1024 }), null);
  assert.match(validateFile({ name: "demo.wav.exe", size: 1024 }) ?? "", /MP3 or WAV/);
  assert.match(validateFile({ name: "demo.mp3", size: 0 }) ?? "", /empty/);
  assert.match(validateFile({ name: "demo.wav", size: 151 * 1024 * 1024 }) ?? "", /150 MB/);
});

test("timestamps stay readable at invalid and end-of-track boundaries", () => {
  assert.equal(formatTime(-1), "0:00");
  assert.equal(formatTime(Number.NaN), "0:00");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(84.9), "1:24");
  assert.equal(formatTime(1800), "30:00");
});
