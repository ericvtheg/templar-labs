import { type Preset, soundById } from "./catalog";
import { type Note, notesAtStep, type Session, type Track } from "./session";

type TrackGraph = {
  input: GainNode;
  volume: GainNode;
  pan: StereoPannerNode;
  filter: BiquadFilterNode;
  drive: WaveShaperNode;
  delay: DelayNode;
  delayWet: GainNode;
  feedback: GainNode;
  reverbWet: GainNode;
  compressor: DynamicsCompressorNode;
  meter: AnalyserNode;
  nodes: AudioNode[];
  settings: string;
};
const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();
const meterBuffers = new WeakMap<AnalyserNode, Float32Array<ArrayBuffer>>();
function readMeter(meter: AnalyserNode) {
  const data = meterBuffers.get(meter) ?? new Float32Array(meter.fftSize);
  meterBuffers.set(meter, data);
  meter.getFloatTimeDomainData(data);
  return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length);
}
function impulse(context: BaseAudioContext) {
  const cached = impulses.get(context);
  if (cached) {
    return cached;
  }
  const buffer = context.createBuffer(2, context.sampleRate * 2, context.sampleRate);
  let seed = 137;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / data.length) ** 3;
    }
  }
  impulses.set(context, buffer);
  return buffer;
}
function createMaster(context: BaseAudioContext, level: number) {
  const input = context.createGain();
  input.gain.value = level * 0.7;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  const meter = context.createAnalyser();
  meter.fftSize = 256;
  input.connect(limiter).connect(meter).connect(context.destination);
  return { input, meter, nodes: [input, limiter, meter] };
}
function createGraph(
  context: BaseAudioContext,
  output: AudioNode,
  track: Track,
  session: Session,
): TrackGraph {
  const input = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  const drive = context.createWaveShaper();
  drive.oversample = "2x";
  const delay = context.createDelay(2);
  const delayWet = context.createGain();
  const feedback = context.createGain();
  const reverb = context.createConvolver();
  reverb.buffer = impulse(context);
  const reverbWet = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const volume = context.createGain();
  const pan = context.createStereoPanner();
  const meter = context.createAnalyser();
  meter.fftSize = 256;
  input.connect(filter).connect(drive).connect(compressor);
  drive.connect(delay).connect(delayWet).connect(compressor);
  delay.connect(feedback).connect(delay);
  drive.connect(reverb).connect(reverbWet).connect(compressor);
  compressor.connect(volume).connect(pan).connect(meter).connect(output);
  const graph = {
    input,
    filter,
    drive,
    delay,
    delayWet,
    feedback,
    reverbWet,
    compressor,
    volume,
    pan,
    meter,
    nodes: [
      input,
      filter,
      drive,
      delay,
      delayWet,
      feedback,
      reverb,
      reverbWet,
      compressor,
      volume,
      pan,
      meter,
    ],
    settings: "",
  };
  updateGraph(graph, track, session, context.currentTime);
  return graph;
}
function updateGraph(graph: TrackGraph, track: Track, session: Session, time: number) {
  const audible = !track.muted && (!session.tracks.some((t) => t.solo) || track.solo);
  graph.volume.gain.setTargetAtTime(audible ? track.volume : 0, time, 0.01);
  graph.pan.pan.setTargetAtTime(track.pan, time, 0.01);
  const settings = JSON.stringify([track.effects, session.bpm]);
  if (settings === graph.settings) {
    return;
  }
  graph.settings = settings;
  const fx = track.effects;
  graph.filter.frequency.setTargetAtTime(
    fx.filter.enabled ? 120 * 160 ** fx.filter.value : 22000,
    time,
    0.01,
  );
  graph.filter.Q.value = fx.filter.enabled ? 1.8 : 0.7;
  const curve = new Float32Array(1024);
  const amount = fx.drive.enabled ? 1 + fx.drive.value * 15 : 1;
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = fx.drive.enabled ? Math.tanh(x * amount) / Math.tanh(amount) : x;
  }
  graph.drive.curve = curve;
  graph.delay.delayTime.setTargetAtTime((60 / session.bpm) * 0.75, time, 0.01);
  graph.delayWet.gain.setTargetAtTime(fx.delay.enabled ? fx.delay.value * 0.65 : 0, time, 0.01);
  graph.feedback.gain.setTargetAtTime(
    fx.delay.enabled ? 0.25 + fx.delay.value * 0.35 : 0,
    time,
    0.01,
  );
  graph.reverbWet.gain.setTargetAtTime(fx.reverb.enabled ? fx.reverb.value * 1.2 : 0, time, 0.01);
  graph.compressor.threshold.value = fx.compressor.enabled ? -12 - fx.compressor.value * 24 : 0;
  graph.compressor.ratio.value = fx.compressor.enabled ? 2 + fx.compressor.value * 8 : 1;
  graph.compressor.knee.value = 12;
  graph.compressor.attack.value = 0.01;
  graph.compressor.release.value = 0.2;
}
function synth(
  context: BaseAudioContext,
  destination: AudioNode,
  preset: Preset,
  note: Note,
  time: number,
  seconds: number,
) {
  const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  filter.frequency.value = preset.cutoff;
  filter.Q.value = 0.7;
  envelope.connect(filter).connect(destination);
  const duration = Math.max(seconds, preset.attack + 0.02);
  const end = time + duration + preset.release;
  const percussive = ["pluck", "keys", "fm"].includes(preset.voice);
  const level = note.velocity * (preset.voice === "pad" ? 0.14 : 0.23);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(level, time + preset.attack);
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.001, level * (percussive ? 0.22 : 0.75)),
    time + duration,
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  const oscillator = context.createOscillator();
  oscillator.type = preset.wave;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = preset.detune;
  const nodes: AudioNode[] = [oscillator, envelope, filter];
  oscillator.connect(envelope);
  if (preset.voice === "fm" || preset.voice === "keys") {
    const mod = context.createOscillator();
    const depth = context.createGain();
    mod.frequency.value = frequency * (preset.voice === "fm" ? 2 : 1);
    depth.gain.setValueAtTime(frequency * (preset.voice === "fm" ? 1.5 : 0.6), time);
    depth.gain.exponentialRampToValueAtTime(0.01, end);
    mod.connect(depth).connect(oscillator.frequency);
    mod.start(time);
    mod.stop(end + 0.02);
    nodes.push(mod, depth);
  }
  if (["pad", "analog", "bass"].includes(preset.voice)) {
    const second = context.createOscillator();
    const gain = context.createGain();
    second.type = preset.voice === "bass" ? "triangle" : preset.wave;
    second.frequency.value = frequency;
    second.detune.value = -7 - preset.detune;
    gain.gain.value = 0.4;
    second.connect(gain).connect(envelope);
    second.start(time);
    second.stop(end + 0.02);
    nodes.push(second, gain);
  }
  if (preset.voice === "pluck" || preset.voice === "bass") {
    filter.frequency.setValueAtTime(preset.cutoff * 1.5, time);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(160, preset.cutoff * 0.3),
      time + duration,
    );
  }
  oscillator.start(time);
  oscillator.stop(end + 0.03);
  oscillator.addEventListener(
    "ended",
    () => {
      for (const node of nodes) {
        node.disconnect();
      }
    },
    { once: true },
  );
}
function trigger(
  context: BaseAudioContext,
  destination: AudioNode,
  track: Track,
  note: Note,
  time: number,
  stepDuration: number,
  buffers: Map<string, AudioBuffer>,
) {
  const sound = soundById(track.sound);
  if (sound.kind === "synth") {
    synth(context, destination, sound, note, time, note.duration * stepDuration);
    return;
  }
  const buffer = buffers.get(sound.id);
  if (!buffer) {
    return;
  }
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = 2 ** ((note.pitch - 60) / 12);
  gain.gain.value = note.velocity * 0.65;
  source.connect(gain).connect(destination);
  source.start(time);
  source.addEventListener(
    "ended",
    () => {
      source.disconnect();
      gain.disconnect();
    },
    { once: true },
  );
}
export function wavBytes(
  buffer: Pick<AudioBuffer, "length" | "sampleRate" | "numberOfChannels" | "getChannelData">,
): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const bytes = new ArrayBuffer(44 + buffer.length * channels * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channels; c++) {
      const value = Math.max(-1, Math.min(1, data[c]?.[i] ?? 0));
      view.setInt16(44 + (i * channels + c) * 2, value * (value < 0 ? 32768 : 32767), true);
    }
  }
  return bytes;
}
export class AudioEngine {
  context: AudioContext | null = null;
  buffers = new Map<string, AudioBuffer>();
  graphs = new Map<string, TrackGraph>();
  master: ReturnType<typeof createMaster> | null = null;
  session: Session;
  playing = false;
  loop = true;
  metronome = false;
  startTime = 0;
  startStep = 0;
  nextStep = 0;
  timer: ReturnType<typeof setInterval> | null = null;
  onTick: (
    step: number,
    playing: boolean,
    meters: Record<string, number> & { master?: number },
  ) => void = () => {
    /* The UI installs a transport listener after construction. */
  };
  constructor(session: Session) {
    this.session = session;
  }
  async ready() {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ latencyHint: "interactive" });
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }
  async loadSamples(context: BaseAudioContext, tracks: Track[]) {
    const ids = [...new Set(tracks.map((t) => t.sound))];
    await Promise.all(
      ids.map(async (id) => {
        const sound = soundById(id);
        if (sound.kind !== "sample" || this.buffers.has(id)) {
          return;
        }
        const response = await fetch(sound.url);
        if (!response.ok) {
          throw new Error(`Could not load ${sound.name}. Please retry.`);
        }
        this.buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()));
      }),
    );
  }
  update(session: Session) {
    const previous = this.session;
    const step = this.position();
    this.session = session;
    if (!this.playing || !this.context || !this.master) {
      return;
    }
    if (previous.bpm !== session.bpm) {
      this.startStep = Math.floor(step);
      this.startTime = this.context.currentTime;
      this.nextStep = this.startStep;
    }
    this.master.input.gain.setTargetAtTime(session.master * 0.7, this.context.currentTime, 0.01);
    for (const track of session.tracks) {
      const graph = this.graphs.get(track.id);
      if (graph) {
        updateGraph(graph, track, session, this.context.currentTime);
      } else {
        this.graphs.set(track.id, createGraph(this.context, this.master.input, track, session));
      }
    }
    for (const [id, graph] of this.graphs) {
      if (!session.tracks.some((t) => t.id === id)) {
        for (const node of graph.nodes) {
          node.disconnect();
        }
        this.graphs.delete(id);
      }
    }
  }
  position() {
    return this.playing && this.context
      ? (this.startStep +
          Math.max(0, this.context.currentTime - this.startTime) / (60 / this.session.bpm / 4)) %
          (this.session.bars * 16)
      : this.startStep;
  }
  async play(step = 0) {
    const context = await this.ready();
    await this.loadSamples(context, this.session.tracks);
    this.stop();
    this.master = createMaster(context, this.session.master);
    for (const track of this.session.tracks) {
      this.graphs.set(track.id, createGraph(context, this.master.input, track, this.session));
    }
    this.startStep = step;
    this.nextStep = step;
    this.startTime = context.currentTime + 0.04;
    this.playing = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const graph of this.graphs.values()) {
      for (const node of graph.nodes) {
        node.disconnect();
      }
    }
    this.graphs.clear();
    if (this.master) {
      for (const node of this.master.nodes) {
        node.disconnect();
      }
      this.master = null;
    }
    this.onTick(this.startStep, false, {});
  }
  schedule() {
    const context = this.context;
    if (!context || !this.playing) {
      return;
    }
    const duration = 60 / this.session.bpm / 4;
    const total = this.session.bars * 16;
    const elapsed = (context.currentTime - this.startTime) / duration + this.startStep;
    if (!this.loop && elapsed >= total) {
      this.startStep = 0;
      this.stop();
      return;
    }
    // Skip missed events after a throttled tab instead of playing a burst of old notes.
    if (this.nextStep < elapsed - 1) {
      this.nextStep = Math.ceil(elapsed);
    }
    while (
      this.startTime + (this.nextStep - this.startStep) * duration <
      context.currentTime + 0.12
    ) {
      const absolute = this.nextStep++;
      if (!this.loop && absolute >= total) {
        break;
      }
      const step = absolute % total;
      const time = Math.max(
        context.currentTime,
        this.startTime +
          (absolute - this.startStep) * duration +
          (step % 2 ? this.session.swing * duration : 0),
      );
      for (const track of this.session.tracks) {
        const graph = this.graphs.get(track.id);
        if (graph) {
          for (const note of notesAtStep(track, step)) {
            trigger(context, graph.input, track, note, time, duration, this.buffers);
          }
        }
      }
      if (this.metronome && step % 4 === 0 && this.master) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.frequency.value = step % 16 === 0 ? 1400 : 900;
        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        osc.connect(gain).connect(this.master.input);
        osc.start(time);
        osc.stop(time + 0.05);
        osc.addEventListener(
          "ended",
          () => {
            osc.disconnect();
            gain.disconnect();
          },
          { once: true },
        );
      }
    }
    const meters: Record<string, number> & { master?: number } = {};
    for (const [id, graph] of this.graphs) {
      meters[id] = readMeter(graph.meter);
    }
    if (this.master) {
      meters.master = readMeter(this.master.meter);
    }
    this.onTick(this.position(), true, meters);
  }
  async preview(track: Track, pitch = 60) {
    const context = await this.ready();
    await this.loadSamples(context, [track]);
    const master = createMaster(context, 0.65);
    const graph = createGraph(
      context,
      master.input,
      { ...track, muted: false, solo: false },
      { ...this.session, tracks: [{ ...track, muted: false, solo: false }] },
    );
    trigger(
      context,
      graph.input,
      track,
      { step: 0, pitch, duration: 2, velocity: 0.8 },
      context.currentTime + 0.01,
      60 / this.session.bpm / 4,
      this.buffers,
    );
    setTimeout(() => {
      for (const node of [...graph.nodes, ...master.nodes]) {
        node.disconnect();
      }
    }, 4000);
  }
  async exportWav(session: Session): Promise<Blob> {
    const duration = 60 / session.bpm / 4;
    const sampleRate = 44100;
    const context = new OfflineAudioContext(
      2,
      Math.ceil((session.bars * 16 * duration + 3) * sampleRate),
      sampleRate,
    );
    await this.loadSamples(context, session.tracks);
    const master = createMaster(context, session.master);
    for (const track of session.tracks) {
      const graph = createGraph(context, master.input, track, session);
      for (let step = 0; step < session.bars * 16; step++) {
        for (const note of notesAtStep(track, step)) {
          trigger(
            context,
            graph.input,
            track,
            note,
            0.01 + step * duration + (step % 2 ? session.swing * duration : 0),
            duration,
            this.buffers,
          );
        }
      }
    }
    return new Blob([wavBytes(await context.startRendering())], { type: "audio/wav" });
  }
  dispose() {
    this.stop();
    void this.context?.close();
  }
}
