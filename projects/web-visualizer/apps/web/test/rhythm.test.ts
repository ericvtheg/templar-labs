import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoChannels } from "../src/demo.ts";
import { analyzeRhythm, sampleRhythm } from "../src/rhythm.ts";

function drums(rate: number, gain = 0.8): Float32Array {
  return Float32Array.from({ length: rate * 8 }, (_, i) => {
    const time = i / rate - 0.25;
    if (time < 0) {
      return 0;
    }
    const phase = time % 0.5;
    return Math.sin(2 * Math.PI * 65 * phase) * Math.exp(-phase * 26) * gain;
  });
}

test("silence produces no drums, drops, tempo, or camera travel", () => {
  const rhythm = analyzeRhythm([new Float32Array(48000)], 48000);
  assert.deepEqual(rhythm.kicks, []);
  assert.deepEqual(rhythm.snares, []);
  assert.deepEqual(rhythm.drops, []);
  assert.equal(rhythm.bpm, null);
  assert.ok(Object.values(sampleRhythm(rhythm, 0.5)).every((value) => value === 0));
});

test("kick onset and 120 BPM remain consistent across common sample rates", () => {
  for (const rate of [16000, 22050, 44100, 48000]) {
    const rhythm = analyzeRhythm([drums(rate)], rate);
    assert.equal(rhythm.bpm, 120, `tempo at ${rate} Hz`);
    assert.equal(rhythm.kicks.length, 16, `kick count at ${rate} Hz`);
    assert.ok(Math.abs((rhythm.kicks[0]?.time ?? 0) - 0.25) <= 0.02);
    assert.ok(sampleRhythm(rhythm, 0.28).kick > 0.65);
    assert.ok(sampleRhythm(rhythm, 0.6).kick < 0.06);
    assert.equal(rhythm.drops.length, 0, "steady drums must not repeatedly trigger drops");
  }
});

test("quiet masters and phase-inverted stereo retain strong kick responses", () => {
  const samples = drums(22050, 0.08);
  const rhythm = analyzeRhythm([samples, samples.map((value) => -value)], 22050);
  assert.equal(rhythm.kicks.length, 16);
  assert.ok(sampleRhythm(rhythm, 1.28).kick > 0.65);
});

test("seeking produces the same transient envelope and camera position every time", () => {
  const rhythm = analyzeRhythm([drums(22050)], 22050);
  const before = sampleRhythm(rhythm, 2.79);
  sampleRhythm(rhythm, 7.5);
  sampleRhythm(rhythm, 0);
  assert.deepEqual(sampleRhythm(rhythm, 2.79), before);
  assert.ok(sampleRhythm(rhythm, 5).drive > before.drive);
});

test("the EDM demo has a 128 BPM pulse, a breakdown, and both drop impacts", () => {
  const channels = createDemoChannels();
  const rhythm = analyzeRhythm(channels, 22050);
  assert.ok(Math.abs((rhythm.bpm ?? 0) - 128) <= 1);
  assert.ok(rhythm.kicks.length > 90);
  assert.ok(rhythm.drops.some((hit) => Math.abs(hit.time - 15) < 0.3));
  assert.ok(rhythm.drops.some((hit) => Math.abs(hit.time - 45) < 0.3));
  assert.ok(sampleRhythm(rhythm, 32).level < 0.15);
  assert.ok(sampleRhythm(rhythm, 15.04).level > 0.7);
  assert.ok(rhythm.drops.length <= 4);
  assert.ok(
    channels.every((channel) =>
      channel.every((value) => Number.isFinite(value) && Math.abs(value) < 0.9),
    ),
  );
});
