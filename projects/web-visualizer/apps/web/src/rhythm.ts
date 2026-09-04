import { clamp } from "./analysis.ts";

export interface Hit {
  time: number;
  strength: number;
}
export interface RhythmAnalysis {
  rate: number;
  bass: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  level: Float32Array;
  drive: Float32Array;
  build: Float32Array;
  kicks: Hit[];
  snares: Hit[];
  drops: Hit[];
  bpm: number | null;
}

export interface RhythmFrame {
  bass: number;
  mid: number;
  high: number;
  level: number;
  kick: number;
  snare: number;
  drop: number;
  build: number;
  drive: number;
  beat: number;
}

function normalize(values: Float32Array): void {
  const sorted = values.toSorted();
  const reference = Math.max(0.006, sorted[Math.floor(sorted.length * 0.96)] ?? 0);
  for (let i = 0; i < values.length; i++) {
    values[i] = clamp((values[i] ?? 0) / reference);
  }
}

function detectHits(band: Float32Array, rate: number, spacing: number, threshold: number): Hit[] {
  const hits: Hit[] = [];
  let average = 0;
  let previous = 0;
  let last = -1;
  for (let i = 0; i < band.length; i++) {
    const value = band[i] ?? 0;
    const rise = value - previous;
    const time = i / rate;
    if (
      time - last >= spacing &&
      value > 0.2 &&
      rise > threshold &&
      value > average * 1.22 + 0.045
    ) {
      hits.push({ time, strength: clamp(0.55 + rise * 1.5) });
      last = time;
    }
    average += (value - average) * 0.035;
    previous = value;
  }
  return hits;
}

function estimateTempo(kicks: Hit[]): number | null {
  const intervals: number[] = [];
  for (let i = 1; i < kicks.length; i++) {
    const delta = (kicks[i]?.time ?? 0) - (kicks[i - 1]?.time ?? 0);
    if (delta > 0.28 && delta < 0.86) {
      intervals.push(delta);
    }
  }
  if (intervals.length < 4) {
    return null;
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 0.5;
  const consistent = intervals.filter((value) => Math.abs(value - median) < 0.035);
  if (consistent.length < intervals.length * 0.4) {
    return null;
  }
  return Math.round(60 / (consistent.reduce((sum, value) => sum + value, 0) / consistent.length));
}

// A sample-rate-aware filter bank measured every 10 ms. Precomputing it means
// fast transients cannot be missed by a slow rendering frame, seek, or export.
export function analyzeRhythm(channels: Float32Array[], sampleRate: number): RhythmAnalysis {
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const rate = 100;
  const length = channels[0]?.length ?? 0;
  const frames = Math.ceil((length / sampleRate) * rate);
  const bass = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const level = new Float32Array(frames);
  const drive = new Float32Array(frames);
  const build = new Float32Array(frames);
  const coefficients = [35, 200, 2800].map(
    (hz) => 1 - Math.exp((-2 * Math.PI * hz * stride) / sampleRate),
  );
  const states = channels.slice(0, 2).map(() => [0, 0, 0]);
  for (let frame = 0; frame < frames; frame++) {
    let bassPower = 0;
    let midPower = 0;
    let highPower = 0;
    let totalPower = 0;
    let count = 0;
    const start = Math.floor((frame * sampleRate) / rate);
    const end = Math.min(length, Math.floor(((frame + 1) * sampleRate) / rate));
    for (let channel = 0; channel < states.length; channel++) {
      const data = channels[channel];
      const state = states[channel];
      if (!data || !state) {
        continue;
      }
      for (let i = start; i < end; i += stride) {
        const sample = data[i] ?? 0;
        for (let band = 0; band < 3; band++) {
          const last = state[band] ?? 0;
          state[band] = last + (coefficients[band] ?? 0) * (sample - last);
        }
        bassPower += ((state[1] ?? 0) - (state[0] ?? 0)) ** 2;
        midPower += ((state[2] ?? 0) - (state[1] ?? 0)) ** 2;
        highPower += (sample - (state[2] ?? 0)) ** 2;
        totalPower += sample * sample;
        count++;
      }
    }
    bass[frame] = Math.sqrt(bassPower / Math.max(1, count));
    mid[frame] = Math.sqrt(midPower / Math.max(1, count));
    high[frame] = Math.sqrt(highPower / Math.max(1, count));
    level[frame] = Math.sqrt(totalPower / Math.max(1, count));
  }
  for (const band of [bass, mid, high, level]) {
    normalize(band);
  }
  const kicks = detectHits(bass, rate, 0.19, 0.15);
  const snares = detectHits(mid, rate, 0.12, 0.1);
  const drops: Hit[] = [];
  let movement = 0;
  let short = 0;
  let long = 0;
  for (let frame = 0; frame < frames; frame++) {
    const value = level[frame] ?? 0;
    short += (value - short) * 0.04;
    long += (value - long) * 0.006;
    build[frame] = clamp((short / Math.max(long, 0.1) - 1) * 1.4);
    movement += (value * 1.6 + (bass[frame] ?? 0) * 2.4) / rate;
    drive[frame] = movement;
  }
  for (let i = 1; i < kicks.length; i++) {
    const hit = kicks[i];
    const previous = kicks[i - 1];
    if (!hit || !previous || hit.time < 2) {
      continue;
    }
    const index = Math.floor(hit.time * rate);
    const before = level.slice(Math.max(0, index - 150), Math.max(0, index - 15));
    const baseline = before.reduce((sum, value) => sum + value, 0) / Math.max(1, before.length);
    const after = level.slice(index, index + 60);
    const sustained = after.reduce((sum, value) => sum + value, 0) / Math.max(1, after.length);
    if (
      (hit.time - previous.time > 1.1 || sustained > baseline * 1.65) &&
      sustained > 0.38 &&
      hit.time - (drops.at(-1)?.time ?? -10) > 4
    ) {
      drops.push({ time: hit.time, strength: 1 });
    }
  }
  return {
    rate,
    bass,
    mid,
    high,
    level,
    drive,
    build,
    kicks,
    snares,
    drops,
    bpm: estimateTempo(kicks),
  };
}

function lastHit(hits: Hit[], time: number): number {
  let low = 0;
  let high = hits.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((hits[middle]?.time ?? Number.POSITIVE_INFINITY) <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low - 1;
}

export function sampleRhythm(rhythm: RhythmAnalysis, time: number): RhythmFrame {
  const position = Math.max(0, time * rhythm.rate);
  const index = Math.floor(position);
  const fraction = position - index;
  const sample = (band: Float32Array) =>
    (band[index] ?? 0) * (1 - fraction) + (band[index + 1] ?? band[index] ?? 0) * fraction;
  const decay = (hits: Hit[], seconds: number) => {
    const hit = hits[lastHit(hits, time)];
    return hit ? Math.exp(-(time - hit.time) / seconds) * hit.strength : 0;
  };
  return {
    bass: sample(rhythm.bass),
    mid: sample(rhythm.mid),
    high: sample(rhythm.high),
    level: sample(rhythm.level),
    drive: sample(rhythm.drive),
    build: sample(rhythm.build),
    kick: decay(rhythm.kicks, 0.115),
    snare: decay(rhythm.snares, 0.075),
    drop: decay(rhythm.drops, 0.8),
    beat: lastHit(rhythm.kicks, time) + 1,
  };
}

export function previewRhythm(time: number): RhythmFrame {
  const beat = (time * 128) / 60;
  const phase = beat % 1;
  const kick = Math.exp(-phase * 5.5);
  return {
    bass: kick * 0.85,
    mid: 0.4,
    high: Math.exp(-((beat * 2) % 1) * 5),
    level: 0.55 + kick * 0.4,
    drive: time * 2,
    build: 0,
    kick,
    snare: Math.floor(beat) % 2 ? Math.exp(-phase * 8) : 0,
    drop: Math.exp(-(beat % 32) * 1.5),
    beat: Math.floor(beat),
  };
}
