import { analyzeChannels, clamp, type TrackAnalysis } from "./analysis";
import { createDemoChannels } from "./demo";
import { analyzeRhythm, type RhythmAnalysis } from "./rhythm";

export interface Track {
  name: string;
  detail: string;
  duration: number;
  analysis: TrackAnalysis;
  rhythm: RhythmAnalysis;
}

export class AudioEngine {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  readonly gain = this.context.createGain();
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private offset = 0;
  private startedAt = 0;
  playing = false;

  constructor() {
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.1;
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
    const rate = 22050;
    const channels = createDemoChannels(rate);
    const buffer = this.context.createBuffer(2, channels[0]?.length ?? rate, rate);
    channels.forEach((samples, index) => {
      buffer.getChannelData(index).set(samples);
    });
    return this.setBuffer(buffer, "Voltage / 128", "Original demo · EDM / 128 BPM");
  }

  private setBuffer(buffer: AudioBuffer, name: string, detail: string): Track {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const analysis = analyzeChannels(channels);
    const rhythm = analyzeRhythm(channels, buffer.sampleRate);
    this.pause();
    this.buffer = buffer;
    this.offset = 0;
    return { name, detail, duration: buffer.duration, analysis, rhythm };
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

  dispose(): void {
    this.pause();
    this.analyser.disconnect();
    this.gain.disconnect();
    void this.context.close();
  }
}
