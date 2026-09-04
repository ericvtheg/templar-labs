import { analyzeChannels, clamp, type TrackAnalysis } from "./analysis";

export interface Track {
  name: string;
  detail: string;
  duration: number;
  analysis: TrackAnalysis;
}

export class AudioEngine {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  readonly gain = this.context.createGain();
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private offset = 0;
  private startedAt = 0;
  private frequency = new Uint8Array(512);
  playing = false;

  constructor() {
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.analyser.connect(this.gain);
    this.gain.connect(this.context.destination);
    this.gain.gain.value = 0.7;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }
  get time(): number {
    return clamp(
      this.offset + (this.playing ? this.context.currentTime - this.startedAt : 0),
      0,
      this.duration,
    );
  }

  async load(file: File): Promise<Track> {
    await this.context.resume();
    let buffer: AudioBuffer;
    try {
      buffer = await this.context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error("This audio file could not be read. Try another MP3 or WAV.");
    }
    if (buffer.duration > 1800) {
      throw new Error("Choose a track up to 30 minutes long.");
    }
    return this.setBuffer(
      buffer,
      file.name.replace(/\.(mp3|wav)$/i, ""),
      `${file.name.split(".").pop()?.toUpperCase()} · ${(buffer.sampleRate / 1000).toFixed(1)} kHz · ${buffer.numberOfChannels === 1 ? "Mono" : "Stereo"}`,
    );
  }

  async demo(): Promise<Track> {
    await this.context.resume();
    // An original, deterministic ambient composition, synthesized locally.
    const rate = 22050;
    const duration = 84;
    const buffer = this.context.createBuffer(2, rate * duration, rate);
    const chords = [
      [110, 130.813, 164.814],
      [87.307, 110, 130.813],
      [130.813, 164.814, 196],
      [97.999, 123.471, 146.832],
    ];
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        const p = t / duration;
        const chordIndex = Math.floor(t / 10.5) % chords.length;
        const chord = chords[chordIndex] ?? chords[0] ?? [];
        const nextChord = chords[(chordIndex + 1) % chords.length] ?? chord;
        const crossfade = clamp(((t % 10.5) - 9) / 1.5);
        let pad = 0;
        for (let n = 0; n < 3; n++) {
          const f = chord[n] ?? 110;
          const next = nextChord[n] ?? f;
          const detune = channel === 0 ? 0.999 : 1.001;
          pad +=
            ((1 - crossfade) * Math.sin(t * f * detune * 2 * Math.PI) +
              crossfade * Math.sin(t * next * detune * 2 * Math.PI)) *
            0.055;
          pad += Math.sin(t * f * 2 * Math.PI * 2.002 + channel) * 0.012;
        }
        const pulseTime = t % (60 / 92);
        const build = Math.sin(Math.PI * p) ** 0.8;
        const kick =
          Math.sin(2 * Math.PI * (46 * pulseTime + 7 * (1 - Math.exp(-pulseTime * 35)))) *
          Math.exp(-pulseTime * 13) *
          0.22 *
          build;
        const note = (chord[Math.floor(t * 3.0667) % 3] ?? 110) * 4;
        const arp =
          Math.sin(2 * Math.PI * note * t) * Math.exp(-(t % (60 / 184)) * 15) * 0.065 * build;
        const fade = clamp(t / 3) * clamp((duration - t) / 5);
        data[i] = (pad * (0.75 + 0.25 * Math.sin(t * 0.4)) + kick + arp) * fade;
      }
    }
    return this.setBuffer(buffer, "Somewhere, beyond", "Original demo · Ambient / 92 BPM");
  }

  private setBuffer(buffer: AudioBuffer, name: string, detail: string): Track {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const analysis = analyzeChannels(channels);
    this.pause();
    this.buffer = buffer;
    this.offset = 0;
    return { name, detail, duration: buffer.duration, analysis };
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) {
      return;
    }
    await this.context.resume();
    if (this.playing) {
      return;
    }
    if (this.offset >= this.duration) {
      this.offset = 0;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.analyser);
    this.source = source;
    this.startedAt = this.context.currentTime;
    this.playing = true;
    source.addEventListener(
      "ended",
      () => {
        if (this.source === source) {
          this.offset = this.duration;
          this.playing = false;
          source.disconnect();
          this.source = null;
        }
      },
      { once: true },
    );
    source.start(0, this.offset);
  }

  pause(): void {
    this.offset = this.time;
    this.playing = false;
    const source = this.source;
    this.source = null;
    if (source) {
      source.stop();
      source.disconnect();
    }
  }

  async seek(time: number): Promise<void> {
    const resume = this.playing;
    this.pause();
    this.offset = clamp(time, 0, this.duration);
    if (resume) {
      await this.play();
    }
  }

  volume(value: number): void {
    this.gain.gain.setTargetAtTime(clamp(value), this.context.currentTime, 0.025);
  }

  levels(): { bass: number; high: number } {
    if (!this.playing) {
      return { bass: 0, high: 0 };
    }
    this.analyser.getByteFrequencyData(this.frequency);
    let bass = 0;
    let high = 0;
    for (let i = 1; i < 12; i++) {
      bass += this.frequency[i] ?? 0;
    }
    for (let i = 50; i < 160; i++) {
      high += this.frequency[i] ?? 0;
    }
    return { bass: bass / (11 * 255), high: high / (110 * 255) };
  }

  dispose(): void {
    this.pause();
    this.analyser.disconnect();
    this.gain.disconnect();
    void this.context.close();
  }
}
