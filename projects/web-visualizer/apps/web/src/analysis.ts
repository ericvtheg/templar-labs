export interface Chapter {
  name: string;
  start: number;
  description: string;
}

export interface TrackAnalysis {
  waveform: number[];
  energy: number[];
  chapters: Chapter[];
}

export const chapterNames = ["Ignition", "Lift-off", "Warp", "Overdrive", "Finale"];

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function analyzeChannels(channels: Float32Array[], bins = 240): TrackAnalysis {
  const length = channels[0]?.length ?? 0;
  const waveform: number[] = [];
  const rms: number[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const start = Math.floor((bin / bins) * length);
    const end = Math.floor(((bin + 1) / bins) * length);
    // Bound analysis work for long tracks, while measuring both stereo channels.
    const stride = Math.max(1, Math.floor((end - start) / 1000));
    let peak = 0;
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i += stride) {
        const sample = channel[i] ?? 0;
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
        count++;
      }
    }
    waveform.push(peak);
    rms.push(count ? Math.sqrt(sum / count) : 0);
  }
  const maxPeak = Math.max(...waveform, 0.001);
  const maxRms = Math.max(...rms, 0.001);
  const energy = rms.map((_, index) => {
    const window = rms.slice(Math.max(0, index - 4), index + 5);
    return window.reduce((sum, value) => sum + value, 0) / window.length / maxRms;
  });
  let climax = Math.floor(bins * 0.65);
  for (let index = Math.floor(bins * 0.5); index < bins * 0.8; index++) {
    if ((energy[index] ?? 0) > (energy[climax] ?? 0)) {
      climax = index;
    }
  }
  const peakPosition = clamp(climax / bins, 0.54, 0.78);
  return {
    waveform: waveform.map((value) => value / maxPeak),
    energy,
    chapters: [
      { name: "Ignition", start: 0, description: "Bring the rig online" },
      { name: "Lift-off", start: 0.16, description: "Let the pressure build" },
      { name: "Warp", start: 0.36, description: "Straight through the sound" },
      { name: "Overdrive", start: peakPosition, description: "Everything at full power" },
      { name: "Finale", start: 0.88, description: "One last hit" },
    ],
  };
}

export function chapterAt(chapters: Chapter[], progress: number): number {
  return Math.max(
    0,
    chapters.findLastIndex((chapter) => progress >= chapter.start),
  );
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function validateFile(file: { name: string; size: number }): string | null {
  if (!/\.(mp3|wav)$/i.test(file.name)) {
    return "Choose an MP3 or WAV audio file.";
  }
  if (file.size === 0) {
    return "This file is empty. Choose another track.";
  }
  if (file.size > 150 * 1024 * 1024) {
    return "Choose a file smaller than 150 MB.";
  }
  return null;
}
