import type { ParticleRenderer } from "./renderer.ts";

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Give browsers time to start the download before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function supportedVideoType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    return undefined;
  }
  return ["video/mp4;codecs=avc1.42001E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}

export class Capture {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private recorder: MediaRecorder | undefined;
  private stream: MediaStream | undefined;
  private chunks: Blob[] = [];
  private elapsed = 0;
  private savedFocus = false;
  private savedPause = false;
  private failed = false;
  onProgress: ((remaining: number) => void) | undefined;
  onComplete: (() => void) | undefined;
  onError: ((message: string) => void) | undefined;

  constructor(private renderer: ParticleRenderer) {
    this.canvas.width = 1200;
    this.canvas.height = 1200;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare image export.");
    }
    this.context = context;
  }

  get recording(): boolean {
    return this.recorder !== undefined;
  }

  private compose() {
    const ctx = this.context;
    const source = this.renderer.canvas;
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, 1200, 1200);
    const size = Math.min(source.width, source.height);
    const sx = (source.width - size) / 2;
    const sy = (source.height - size) / 2;
    ctx.drawImage(source, sx, sy, size, size, 0, 0, 1200, 1200);
    ctx.fillStyle = "#d5bffa";
    ctx.font = "500 25px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("✳  little chaos", 60, 78);
    ctx.fillStyle = "#7f758b";
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    ctx.fillText("32,000 PARTICLES. ONE LITTLE UNIVERSE.", 1140, 76);
    ctx.fillStyle = "#e1d3f4";
    ctx.font = "italic 45px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("Order is optional.", 600, 1082);
    ctx.fillStyle = "#a899b9";
    ctx.font = "16px monospace";
    ctx.fillText("little-chaos.ericventor.com", 600, 1126);
  }

  async snapshot() {
    const previousFocus = this.renderer.focused;
    try {
      this.renderer.focused = true;
      this.renderer.render(0);
      this.compose();
    } finally {
      this.renderer.focused = previousFocus;
      this.renderer.render(0);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      throw new Error("Couldn't save that image. Please try again.");
    }
    download(blob, "little-chaos.png");
  }

  start() {
    if (this.recording) {
      return;
    }
    const mimeType = supportedVideoType();
    if (!mimeType) {
      throw new Error("Video export isn't supported here. You can still save an image.");
    }
    this.savedFocus = this.renderer.focused;
    this.savedPause = this.renderer.paused;
    this.renderer.focused = true;
    this.renderer.paused = false;
    this.failed = false;
    this.elapsed = 0;
    this.chunks = [];
    try {
      this.renderer.render(0);
      this.compose();
      this.stream = this.canvas.captureStream(30);
      const recorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        this.failed = true;
        this.onError?.("Recording failed. Please try saving an image instead.");
        if (recorder.state !== "inactive") {
          recorder.stop();
        } else {
          this.cleanup();
        }
      });
      recorder.addEventListener("stop", () => {
        if (!this.failed && this.chunks.length > 0) {
          const actualType = recorder.mimeType || mimeType;
          download(
            new Blob(this.chunks, { type: actualType }),
            `little-chaos.${actualType.includes("mp4") ? "mp4" : "webm"}`,
          );
        }
        const success = !this.failed && this.chunks.length > 0;
        this.cleanup();
        if (success) {
          this.onComplete?.();
        }
      });
      recorder.start();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private cleanup() {
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.stream = undefined;
    this.recorder = undefined;
    this.renderer.focused = this.savedFocus;
    this.renderer.paused = this.savedPause;
    this.chunks = [];
  }

  cancel() {
    const recorder = this.recorder;
    if (!recorder) {
      return;
    }
    this.failed = true;
    if (recorder.state !== "inactive") {
      recorder.stop();
    } else {
      this.cleanup();
    }
  }

  tick(dt: number): number | undefined {
    if (!this.recorder || this.recorder.state !== "recording") {
      return undefined;
    }
    this.elapsed += dt;
    this.compose();
    this.onProgress?.(Math.max(0, 8 - this.elapsed));
    if (this.elapsed >= 8) {
      this.recorder.stop();
      return 0;
    }
    // The clip opens on the form, scatters, and finishes by coming home.
    return this.elapsed > 1.2 && this.elapsed < 3.5 ? 1 : 0;
  }
}
