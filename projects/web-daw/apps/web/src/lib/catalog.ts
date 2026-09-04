export const colors = [
  "#d3a87c",
  "#e08e92",
  "#dabd70",
  "#8bbaaa",
  "#9cace0",
  "#ba9ddd",
  "#d09cac",
  "#7ebac9",
];
export const families = ["Kick", "Snare", "Clap", "Hi-hat", "Open hat", "Percussion", "Tom", "FX"];
const flavors = ["Classic", "Deep", "Dusty", "Tight", "Analog", "Crushed", "Soft", "Bright"];
export const samples = families.flatMap((family, group) =>
  flavors.map((flavor, variant) => ({
    id: `sample-${group}-${variant}`,
    name: `${flavor} ${family}`,
    family,
    kind: "sample" as const,
    description: `${family} · Original one-shot`,
    url: `/samples/${group}-${variant}.wav`,
  })),
);
export type SynthVoice = "analog" | "fm" | "pluck" | "pad" | "bass" | "keys";
export type Preset = {
  id: string;
  name: string;
  family: string;
  kind: "synth";
  voice: SynthVoice;
  wave: OscillatorType;
  cutoff: number;
  attack: number;
  release: number;
  detune: number;
  description: string;
};
const banks: {
  voice: SynthVoice;
  names: string[];
  wave: OscillatorType;
  cutoff: number;
  attack: number;
  release: number;
}[] = [
  {
    voice: "analog",
    names: ["Amber Lead", "Neon Saw", "Sunday Triangle", "Silver Pulse"],
    wave: "sawtooth",
    cutoff: 3800,
    attack: 0.01,
    release: 0.25,
  },
  {
    voice: "bass",
    names: ["Sub Foundation", "Rubber Bass", "Acid Circuit", "Roundhouse"],
    wave: "sine",
    cutoff: 700,
    attack: 0.008,
    release: 0.13,
  },
  {
    voice: "keys",
    names: ["Velvet Keys", "Tape Piano", "Glass House", "Midnight Electric"],
    wave: "triangle",
    cutoff: 4200,
    attack: 0.004,
    release: 0.8,
  },
  {
    voice: "pad",
    names: ["Cloud Nine", "Warm Horizons", "Violet Haze", "Slow Bloom"],
    wave: "sawtooth",
    cutoff: 1600,
    attack: 0.28,
    release: 1.4,
  },
  {
    voice: "pluck",
    names: ["Daylight Pluck", "Wood & Wire", "Tiny Satellites", "Golden Hour"],
    wave: "triangle",
    cutoff: 5000,
    attack: 0.003,
    release: 0.3,
  },
  {
    voice: "fm",
    names: ["FM Bell", "Crystal EP", "Metal Garden", "Orbit Mallet"],
    wave: "sine",
    cutoff: 6500,
    attack: 0.002,
    release: 0.7,
  },
];
export const presets: Preset[] = banks.flatMap((bank) =>
  bank.names.map((name, i) => ({
    ...bank,
    id: `synth-${bank.voice}-${i}`,
    name,
    family: bank.voice.charAt(0).toUpperCase() + bank.voice.slice(1),
    kind: "synth" as const,
    wave: i === 3 && bank.voice !== "fm" ? ("square" as const) : bank.wave,
    cutoff: bank.cutoff * (1 + i * 0.3),
    release: bank.release * (1 + i * 0.2),
    detune: i * 4,
    description: `${bank.voice === "fm" ? "FM" : "Polyphonic"} instrument · ${["Warm", "Textured", "Bright", "Wide"][i]}`,
  })),
);
export const defaultPreset = presets[0] as Preset;
export const sounds = [...samples, ...presets];
export type Sound = (typeof sounds)[number];
export const soundById = (id: string) => sounds.find((sound) => sound.id === id) ?? defaultPreset;
export const effects = [
  {
    id: "filter",
    name: "Color Filter",
    category: "Tone shaping",
    description: "Resonant low-pass filter",
    color: "#d3a87c",
  },
  {
    id: "drive",
    name: "Saturator",
    category: "Distortion",
    description: "Soft-clipped analog warmth",
    color: "#e08e92",
  },
  {
    id: "delay",
    name: "Echo",
    category: "Delay",
    description: "Tempo-synced stereo echo",
    color: "#8bbaaa",
  },
  {
    id: "reverb",
    name: "Space",
    category: "Reverb",
    description: "Algorithmic room ambience",
    color: "#9cace0",
  },
  {
    id: "compressor",
    name: "Glue",
    category: "Dynamics",
    description: "Track dynamics compressor",
    color: "#ba9ddd",
  },
] as const;
export type EffectId = (typeof effects)[number]["id"];
export const noteName = (midi: number) =>
  `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
