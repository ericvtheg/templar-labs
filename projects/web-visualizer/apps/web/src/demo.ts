// Original 128 BPM club demo: groove, rising snare rolls, two drops, and a breakdown.
export function createDemoChannels(rate = 22050): Float32Array[] {
  const bpm = 128;
  const duration = (32 * 4 * 60) / bpm;
  const notes = [55, 65.406, 41.203, 48.999];
  const melody = [0, 7, 12, 7, 3, 7, 15, 12, 0, 7, 10, 7, 3, 10, 15, 7];
  return [0, 1].map((channel) => {
    const data = new Float32Array(Math.ceil(rate * duration));
    let random = 48317;
    let noiseLow = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const beat = (time * bpm) / 60;
      const bar = Math.floor(beat / 4);
      const beatTime = (beat % 1) * (60 / bpm);
      const breakdown = bar >= 16 && bar < 20;
      const rising = (bar >= 4 && bar < 8) || (bar >= 20 && bar < 24);
      const drop = (bar >= 8 && bar < 16) || bar >= 24;
      const lift = rising ? ((beat / 4) % 4) / 4 : 0;
      const kickOn = !breakdown && (!rising || lift < 0.65);
      const root = notes[Math.floor(bar / 2) % notes.length] ?? 55;
      random = (Math.imul(random, 1664525) + 1013904223) | 0;
      const noise = random / 2147483648;
      noiseLow += (noise - noiseLow) * 0.18;
      const hiss = noise - noiseLow;
      const kick = kickOn
        ? Math.sin(2 * Math.PI * (48 * beatTime + 4.2 * (1 - Math.exp(-beatTime * 38)))) *
          Math.exp(-beatTime * 16) *
          0.9
        : 0;
      const duck = kickOn ? 1 - 0.93 * Math.exp(-beatTime * 12) : 1;
      const bassPhase = 2 * Math.PI * root * time;
      const bass =
        (Math.sin(bassPhase) + Math.sin(bassPhase * 2) * 0.3 + Math.sin(bassPhase * 3) * 0.13) *
        duck *
        (drop ? 0.3 : 0.18) *
        (breakdown ? 0.12 : 1);
      const snareSpacing = rising ? (lift > 0.8 ? 0.125 : lift > 0.5 ? 0.25 : 0.5) : 2;
      const snareTime = (((beat + 1) % snareSpacing) * 60) / bpm;
      const clap = !breakdown
        ? (hiss * 0.42 + Math.sin(time * 180 * Math.PI * 2) * 0.12) *
          Math.exp(-snareTime * 29) *
          (rising ? 0.45 + lift : 1)
        : 0;
      const hatTime = ((beat * 2 + 1) % 1) * (30 / bpm);
      const hat = hiss * Math.exp(-hatTime * 90) * (breakdown ? 0.025 : 0.12);
      const note = root * 4 * 2 ** ((melody[Math.floor(beat * 2) % melody.length] ?? 0) / 12);
      const phase = time * note * 2 * Math.PI;
      const lead =
        (Math.sin(phase * 0.997 + channel * 0.3) +
          Math.sin(phase * 1.003 - channel * 0.3) +
          Math.sin(phase * 2) * 0.25 +
          Math.sin(phase * 3) * 0.1) *
        Math.exp(-((beat * 2) % 1) * 3) *
        duck *
        (drop ? 0.105 : breakdown ? 0.028 : 0.035);
      const riser = rising
        ? hiss * lift ** 2 * 0.12 * (0.5 + 0.5 * Math.sin(time * (12 + lift * 60)))
        : 0;
      const impactTime = (bar >= 24 ? beat - 96 : beat - 32) * (60 / bpm);
      const crash = impactTime >= 0 && impactTime < 2 ? hiss * Math.exp(-impactTime * 3) * 0.24 : 0;
      const fade = Math.min(1, time / 0.008, (duration - time) / 0.8);
      data[i] = Math.tanh((kick + bass + clap + hat + lead + riser + crash) * 1.15) * fade * 0.88;
    }
    return data;
  });
}
