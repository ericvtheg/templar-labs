export class Footage {
  readonly video = document.createElement("video");
  private readonly url: string;
  private disposed = false;
  error: string | null = null;
  version = 0;
  private frameRequest = 0;

  private watchFrame = () => {
    if (this.disposed) {
      return;
    }
    this.version++;
    this.frameRequest = this.video.requestVideoFrameCallback(this.watchFrame);
  };

  private constructor(
    readonly name: string,
    file: File,
  ) {
    this.url = URL.createObjectURL(file);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.src = this.url;
  }

  static async load(file: File): Promise<Footage> {
    if (!/\.(mp4|webm|mov)$/i.test(file.name) || file.size > 500 * 1024 * 1024) {
      throw new Error("Choose an MP4, WebM, or MOV animation under 500 MB.");
    }
    const footage = new Footage(file.name, file);
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          footage.video.removeEventListener("loadeddata", loaded);
          footage.video.removeEventListener("error", failed);
        };
        const loaded = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error("This animation could not be decoded. Try an H.264 MP4 or WebM."));
        };
        const timeout = setTimeout(failed, 15000);
        footage.video.addEventListener("loadeddata", loaded, { once: true });
        footage.video.addEventListener("error", failed, { once: true });
        footage.video.load();
      });
      if (!Number.isFinite(footage.video.duration) || footage.video.duration < 0.1) {
        throw new Error("This animation needs a finite duration of at least 0.1 seconds.");
      }
      if (typeof footage.video.requestVideoFrameCallback === "function") {
        footage.watchFrame();
      } else {
        footage.video.addEventListener("seeked", () => {
          footage.version++;
        });
        footage.video.addEventListener("timeupdate", () => {
          footage.version++;
        });
      }
      footage.video.addEventListener("error", () => {
        if (!footage.disposed) {
          footage.error = "The animation stopped decoding. Try another clip.";
        }
      });
      return footage;
    } catch (error) {
      footage.dispose();
      throw error;
    }
  }

  sync(time: number, playing: boolean): void {
    if (this.disposed) {
      return;
    }
    const video = this.video;
    const target = Math.max(0, time) % video.duration;
    if (!video.seeking && Math.abs(video.currentTime - target) > (playing ? 0.06 : 0.025)) {
      video.currentTime = target;
    }
    if (playing && video.paused) {
      void video.play().catch((cause: unknown) => {
        if (!this.disposed && !(cause instanceof DOMException && cause.name === "AbortError")) {
          this.error = "The animation could not play. Reload it or choose another clip.";
        }
      });
    } else if (!playing && !video.paused) {
      video.pause();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameRequest) {
      this.video.cancelVideoFrameCallback(this.frameRequest);
    }
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    URL.revokeObjectURL(this.url);
  }
}
