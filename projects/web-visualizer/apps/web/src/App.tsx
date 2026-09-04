import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Expand,
  Film,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { analyzeChannels, chapterAt, formatTime, validateFile } from "./analysis";
import { AudioEngine, type Track } from "./audio";
import { sampleChoreography } from "./choreography";
import { Footage } from "./footage";
import { colorPresets, type ShowColors } from "./identity";
import { profiles } from "./profiles";
import { previewRhythm, sampleRhythm } from "./rhythm";
import { Visualizer } from "./visualizer";

const palettes = colorPresets.map((preset) => preset.name);
const emptyAnalysis = analyzeChannels([]);
const ratios = [
  { name: "16:9", value: 16 / 9 },
  { name: "9:16", value: 9 / 16 },
  { name: "1:1", value: 1 },
];

interface Recording {
  recorder: MediaRecorder;
  cancelled: boolean;
  release: () => void;
}

function getRecordingType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function App() {
  const id = useId();
  const volumeRef = useRef(70);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [profile, setProfile] = useState(0);
  const showProfile = profiles[profile] ?? profiles[0];
  const scenes = showProfile.worlds;
  const [scene, setScene] = useState(0);
  const [activeScene, setActiveScene] = useState(0);
  const [director, setDirector] = useState(true);
  const [palette, setPalette] = useState(-1);
  const [artist, setArtist] = useState("");
  const [footage, setFootage] = useState<Footage | null>(null);
  const [footageLoading, setFootageLoading] = useState(false);
  const footageRequest = useRef(0);
  const footageRef = useRef<Footage | null>(null);
  const footageInput = useRef<HTMLInputElement>(null);
  const [colors, setColors] = useState<ShowColors>(profiles[0].colors);
  const [intensity, setIntensity] = useState(95);
  const [motion, setMotion] = useState(85);
  const [grain, setGrain] = useState(false);
  const [flashes, setFlashes] = useState(true);
  const [beatCount, setBeatCount] = useState(0);
  const meters = useRef<HTMLElement>(null);
  const [ratioIndex, setRatioIndex] = useState(0);
  const [volume, setVolume] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<"export" | "help" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const engine = useRef<AudioEngine | null>(null);
  const renderer = useRef<Visualizer | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const recording = useRef<Recording | null>(null);
  const busy = useRef(false);
  const dragDepth = useRef(0);
  const settings = useRef({
    track,
    scene,
    profile,
    palette,
    artist,
    colors,
    footage,
    intensity,
    motion,
    grain,
    ratioIndex,
    reducedMotion,
    flashes,
    director,
  });
  const ratio = ratios[ratioIndex]?.value ?? 16 / 9;
  const analysis = track?.analysis ?? emptyAnalysis;
  const progress = track ? time / track.duration : 0;
  const chapter = chapterAt(analysis.chapters, progress);
  const currentScene = footage
    ? { name: "Your animation", description: footage.name }
    : (scenes[activeScene] ?? scenes[0]);

  useEffect(() => {
    settings.current = {
      track,
      scene,
      profile,
      palette,
      artist,
      colors,
      footage,
      intensity,
      motion,
      grain,
      ratioIndex,
      reducedMotion,
      flashes,
      director,
    };
  }, [
    track,
    scene,
    profile,
    palette,
    artist,
    colors,
    footage,
    intensity,
    motion,
    grain,
    ratioIndex,
    reducedMotion,
    flashes,
    director,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!canvas.current) {
      return;
    }
    let visualizer: Visualizer;
    try {
      visualizer = new Visualizer(canvas.current);
      renderer.current = visualizer;
    } catch (cause) {
      setVisualError(cause instanceof Error ? cause.message : "Unable to start the visual engine.");
      return;
    }
    let frameId = 0;
    let lastUpdate = 0;
    const render = (now: number) => {
      const current = settings.current;
      const audio = engine.current;
      const currentTime = audio?.time ?? 0;
      const position = current.track ? currentTime / current.track.duration : 0.3;
      const rhythm = current.track
        ? sampleRhythm(current.track.rhythm, currentTime)
        : previewRhythm(now / 1000);
      const slow = current.reducedMotion ? 0.15 : 1;
      const rig =
        current.director && !current.reducedMotion
          ? (current.scene + Math.floor(rhythm.beat / 16)) % scenes.length
          : current.scene;
      meters.current?.style.setProperty("--kick", String(rhythm.kick));
      meters.current?.style.setProperty("--snare", String(rhythm.snare));
      meters.current?.style.setProperty("--high", String(rhythm.high));
      const clip = current.footage;
      clip?.sync(
        current.track ? currentTime : now / 1000,
        current.track ? Boolean(audio?.playing) : true,
      );
      if (clip?.error) {
        setError(clip.error);
        clip.dispose();
        footageRef.current = null;
        setFootage(null);
      }
      visualizer.render(
        {
          ...rhythm,
          ...sampleChoreography(
            current.track?.rhythm ?? null,
            current.track ? currentTime : now / 1000,
            rhythm.beat,
            current.reducedMotion,
          ),
          time: (current.track ? currentTime : now / 1000) * slow,
          progress: position,
          kick: rhythm.kick * slow,
          snare: rhythm.snare * slow,
          drop: rhythm.drop * slow,
          drive: rhythm.drive * slow,
          beat: current.reducedMotion ? 0 : rhythm.beat,
          flash: current.flashes && !current.reducedMotion,
          scene: rig,
          profile: current.profile,
          footageFrame: clip?.version ?? 0,
          palette: current.palette,
          artist: current.artist,
          footage: clip?.video,
          colors: current.colors,
          intensity: current.intensity / 100,
          motion: current.motion / 100,
          grain: current.grain,
          loaded: Boolean(current.track),
        },
        ratios[current.ratioIndex]?.value ?? 16 / 9,
        Boolean(recording.current),
      );
      if (now - lastUpdate > 80) {
        setTime(currentTime);
        setBeatCount(rhythm.beat);
        setActiveScene(rig);
        setPlaying(audio?.playing ?? false);
        lastUpdate = now;
        if (recording.current && audio && !audio.playing && currentTime >= audio.duration) {
          if (recording.current.recorder.state === "recording") {
            recording.current.recorder.stop();
          }
        }
      }
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frameId);
      engine.current?.pause();
      const active = recording.current;
      if (active) {
        active.cancelled = true;
        if (active.recorder.state !== "inactive") {
          active.recorder.stop();
        }
        active.release();
      }
      setVisualError(
        "The graphics connection was interrupted. Reload this page to restart the visual engine.",
      );
    };
    const element = canvas.current;
    element.addEventListener("webglcontextlost", onContextLost);
    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener("webglcontextlost", onContextLost);
      visualizer.dispose();
      renderer.current = null;
    };
  }, [scenes.length]);

  useEffect(
    () => () => {
      const active = recording.current;
      if (active) {
        active.cancelled = true;
        if (active.recorder.state !== "inactive") {
          active.recorder.stop();
        }
        active.release();
      }
      footageRequest.current++;
      footageRef.current?.dispose();
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [modal]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const loadTrack = useCallback(async (file?: File) => {
    if (busy.current || recording.current) {
      return;
    }
    if (file) {
      const issue = validateFile(file);
      if (issue) {
        setError(issue);
        return;
      }
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const audio = engine.current ?? new AudioEngine();
      engine.current = audio;
      audio.volume(volumeRef.current / 100);
      const next = file ? await audio.load(file) : await audio.demo();
      setTrack(next);
      setTime(0);
      await audio.play();
      setPlaying(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this track.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const togglePlayback = useCallback(async () => {
    if (recording.current || busy.current) {
      return;
    }
    if (!engine.current || !settings.current.track) {
      await loadTrack();
      return;
    }
    if (engine.current.playing) {
      engine.current.pause();
    } else {
      await engine.current.play();
    }
    setPlaying(engine.current.playing);
    setTime(engine.current.time);
  }, [loadTrack]);

  const handleFailure = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (event.code !== "Space" || element.matches("input, button, select, textarea") || modal) {
        return;
      }
      event.preventDefault();
      void togglePlayback().catch(handleFailure);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [togglePlayback, modal, handleFailure]);

  async function loadFootage(file: File) {
    const request = ++footageRequest.current;
    setFootageLoading(true);
    try {
      const next = await Footage.load(file);
      if (request !== footageRequest.current) {
        next.dispose();
        return;
      }
      footageRef.current?.dispose();
      footageRef.current = next;
      setFootage(next);
      setError(null);
    } catch (cause) {
      if (request === footageRequest.current) {
        handleFailure(cause);
      }
    } finally {
      if (request === footageRequest.current) {
        setFootageLoading(false);
      }
    }
  }

  function removeFootage() {
    footageRequest.current++;
    footageRef.current?.dispose();
    footageRef.current = null;
    setFootage(null);
    setFootageLoading(false);
  }

  async function seek(next: number) {
    if (!recording.current) {
      await engine.current?.seek(next);
      setTime(next);
    }
  }

  async function startExport() {
    const audio = engine.current;
    const surface = canvas.current;
    const mimeType = getRecordingType();
    if (!audio || !surface || !track || !mimeType || recording.current || visualError) {
      return;
    }
    setModal(null);
    setError(null);
    audio.pause();
    await audio.seek(0);
    const stream = surface.captureStream(30);
    const destination = audio.context.createMediaStreamDestination();
    audio.analyser.connect(destination);
    for (const audioTrack of destination.stream.getAudioTracks()) {
      stream.addTrack(audioTrack);
    }
    const chunks: BlobPart[] = [];
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      for (const mediaTrack of stream.getTracks()) {
        mediaTrack.stop();
      }
      audio.analyser.disconnect(destination);
      recording.current = null;
      setExporting(false);
    };
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 256_000,
      });
      const active: Recording = { recorder, cancelled: false, release };
      recording.current = active;
      setExporting(true);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener(
        "error",
        () => {
          active.cancelled = true;
          setError(
            "The browser could not finish this export. Try a shorter track or another browser.",
          );
          audio.pause();
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          release();
        },
        { once: true },
      );
      recorder.addEventListener(
        "stop",
        () => {
          release();
          if (active.cancelled || chunks.length === 0) {
            return;
          }
          const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `${track.name.replace(/[^a-z0-9_-]/gi, "-")}-afterglow.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          setNotice("Your film is ready. The download has started.");
        },
        { once: true },
      );
      // Size and paint the export canvas before recording its first frame.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (active.cancelled) {
        return;
      }
      recorder.start(1000);
      await audio.play();
    } catch (cause) {
      const active = recording.current;
      if (active) {
        active.cancelled = true;
        if (active.recorder.state !== "inactive") {
          active.recorder.stop();
        }
        active.release();
      }
      release();
      handleFailure(cause);
    }
  }

  function cancelExport() {
    const active = recording.current;
    if (!active) {
      return;
    }
    active.cancelled = true;
    if (active.recorder.state !== "inactive") {
      active.recorder.stop();
    }
    active.release();
    engine.current?.pause();
    setNotice("Export cancelled. Your track and settings are still here.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Afterglow home">
          <span className="brand-mark">
            <Orbit size={29} strokeWidth={1.3} />
          </span>
          afterglow<span className="brand-dot">®</span>
        </a>
        <div className="workspace-label">
          <span /> MUSIC INTO MOTION
        </div>
        <div className="header-actions">
          <button
            className="icon-button help-button"
            type="button"
            aria-label="How Afterglow works"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
          </button>
          <span className="header-divider" />
          <button
            className="button button-light export-button"
            type="button"
            disabled={!track || loading || footageLoading || exporting || Boolean(visualError)}
            onClick={() => setModal("export")}
          >
            <ArrowDownToLine size={15} /> Export film <span className="export-arrow">↗</span>
          </button>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-star">✳</span> BUILT FOR THE DROP
            </div>
            <h1>
              Your track.
              <br />
              <span>The whole mainstage.</span>
            </h1>
          </div>
          <div className="intro-copy">
            <p>
              Turn your track into a full-scale lightshow.
              <br />
              Hard kicks. Laser sweeps. Drops that hit.
            </p>
            <div className="intro-meta">
              <span>
                <AudioLines size={13} /> Audio-reactive
              </span>
              <span>
                <LockKeyhole size={12} /> Yours. Always.
              </span>
            </div>
          </div>
        </section>

        <fieldset className="profile-picker" disabled={exporting}>
          <legend>CHOOSE YOUR SHOW</legend>
          <div className="profile-options">
            {profiles.map((item, index) => (
              <button
                type="button"
                key={item.name}
                aria-label={`${item.name} profile`}
                aria-pressed={profile === index}
                className={`profile-card profile-${index} ${profile === index ? "selected" : ""}`}
                onClick={() => {
                  removeFootage();
                  setProfile(index);
                  setScene(0);
                  setActiveScene(0);
                  setDirector(true);
                  setColors(item.colors);
                  setPalette(-1);
                  setIntensity(item.impact);
                  setMotion(item.velocity);
                }}
              >
                <span
                  className="profile-art"
                  style={{ backgroundImage: `url(/worlds/${index}-0.webp)` }}
                />
                <span className="profile-copy">
                  <small>{item.inspiration}</small>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </span>
                {profile === index && <Check size={14} />}
              </button>
            ))}
          </div>
          <p>
            Original show profiles inspired by live visual production. Each sets the worlds,
            choreography, lighting, and palette.
          </p>
        </fieldset>
        <div className="studio-grid">
          <section className="workspace" aria-label="Visual preview and track">
            <div className="panel-top">
              <span className="panel-label">
                <span className={`status-dot ${playing ? "is-playing" : ""}`} />{" "}
                {exporting ? "RENDERING YOUR FILM" : playing ? "LIVE PREVIEW" : "THE CANVAS"}
              </span>
              <div className="preview-options">
                <span className="preview-quality">
                  {exporting
                    ? "1080p / 30 FPS"
                    : track?.rhythm.bpm
                      ? `≈ ${track.rhythm.bpm} BPM`
                      : track
                        ? "AUDIO LOCKED"
                        : "128 BPM"}
                </span>
                <label className="ratio-select">
                  <span className="sr-only">Aspect ratio</span>
                  <select
                    value={ratioIndex}
                    disabled={exporting}
                    onChange={(event) => setRatioIndex(Number(event.target.value))}
                  >
                    {ratios.map((item, index) => (
                      <option key={item.name} value={index}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} />
                </label>
              </div>
            </div>
            <div
              className={`stage-shell ${ratioIndex === 1 ? "portrait" : ""} ${ratioIndex === 2 ? "square" : ""}`}
              ref={stage}
            >
              <div className="canvas-wrap" style={{ aspectRatio: ratio }}>
                <canvas
                  ref={canvas}
                  aria-label={`${currentScene?.name} audio-reactive visual`}
                  onDoubleClick={() => {
                    void stage.current?.requestFullscreen().catch(handleFailure);
                  }}
                />
                <div className="stage-vignette" />
                {visualError ? (
                  <div className="visual-error" role="alert">
                    <CircleHelp size={26} />
                    <p>{visualError}</p>
                  </div>
                ) : (
                  <>
                    <div className="stage-topline">
                      <span>
                        <span className="record-dot" />{" "}
                        {track ? "DRIVEN BY YOUR AUDIO" : "128 BPM · VISUAL PREVIEW"}
                      </span>
                      <span className="stage-counter">
                        BEAT {String(beatCount).padStart(3, "0")}
                      </span>
                    </div>
                    <div className="stage-caption">
                      <span className="stage-kicker">
                        {track ? `CHAPTER ${String(chapter + 1).padStart(2, "0")}` : "WORLD 001"}{" "}
                        <span>—</span>{" "}
                        {track
                          ? analysis.chapters[chapter]?.description
                          : currentScene?.description}
                      </span>
                      <h2>
                        {track ? analysis.chapters[chapter]?.name : currentScene?.name}
                        <span>.</span>
                      </h2>
                    </div>
                    <button
                      className="fullscreen-button icon-button"
                      type="button"
                      aria-label="Enter fullscreen"
                      onClick={() => {
                        void stage.current?.requestFullscreen().catch(handleFailure);
                      }}
                    >
                      <Expand size={17} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <section className="signal-strip" ref={meters} aria-label="Live drum response">
              <span className="signal-title">{track ? "AUDIO → LIGHT" : "DEMO LIGHT RIG"}</span>
              <span className="drum-meter kick-meter">
                KICK
                <i>
                  <b />
                </i>
              </span>
              <span className="drum-meter snare-meter">
                SNARE
                <i>
                  <b />
                </i>
              </span>
              <span className="drum-meter high-meter">
                HIGH
                <i>
                  <b />
                </i>
              </span>
            </section>
            <div className="transport">
              <div className="transport-left">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Restart track"
                  disabled={!track || exporting || loading}
                  onClick={() => {
                    void seek(0).catch(handleFailure);
                  }}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="play-button"
                  type="button"
                  aria-label={playing ? "Pause" : track ? "Play" : "Play demo"}
                  disabled={loading || exporting || Boolean(visualError)}
                  onClick={() => {
                    void togglePlayback().catch(handleFailure);
                  }}
                >
                  {loading ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : playing ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <span className="timecode">
                  {formatTime(time)} <span>/ {formatTime(track?.duration ?? 0)}</span>
                </span>
              </div>
              <div className="transport-right">
                <span className="space-hint">space to {playing ? "pause" : "play"}</span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={volume === 0 ? "Unmute" : "Mute"}
                  onClick={() => {
                    const next = volume === 0 ? 70 : 0;
                    setVolume(next);
                    volumeRef.current = next;
                    engine.current?.volume(next / 100);
                  }}
                >
                  {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <input
                  className="volume-slider"
                  aria-label="Playback volume"
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setVolume(next);
                    volumeRef.current = next;
                    engine.current?.volume(next / 100);
                  }}
                />
              </div>
            </div>

            <section
              aria-label="Upload audio"
              className={`track-drop ${dragging ? "dragging" : ""} ${track ? "has-track" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current++;
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current--;
                if (dragDepth.current === 0) {
                  setDragging(false);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) {
                  void loadTrack(file);
                }
              }}
            >
              <input
                ref={fileInput}
                id={`${id}-audio-upload`}
                className="sr-only"
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
                disabled={loading || exporting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void loadTrack(file);
                  }
                  event.target.value = "";
                }}
              />
              {track ? (
                <>
                  <div className="track-heading">
                    <div className="track-icon">
                      <AudioLines size={20} />
                    </div>
                    <div className="track-title">
                      <strong>{track.name}</strong>
                      <span>{track.detail}</span>
                    </div>
                    <button
                      className="text-button replace-button"
                      type="button"
                      disabled={loading || exporting}
                      onClick={() => fileInput.current?.click()}
                    >
                      {loading ? "Analyzing…" : "Replace track"}
                      <Upload size={13} />
                    </button>
                  </div>
                  <div className="waveform">
                    <svg
                      viewBox="0 0 960 58"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Track waveform"
                    >
                      {analysis.waveform.map((height, index) => (
                        <rect
                          key={`bin-${index.toString()}`}
                          x={index * 4}
                          y={29 - Math.max(1, height * 25)}
                          width="2"
                          height={Math.max(2, height * 50)}
                          rx="1"
                          fill={index / 240 <= progress ? "#d2f6a5" : "#4b5148"}
                        />
                      ))}
                    </svg>
                    <div className="playhead" style={{ left: `${progress * 100}%` }} />
                    <input
                      aria-label="Track position"
                      type="range"
                      min="0"
                      max={track.duration}
                      step="0.05"
                      value={time}
                      disabled={exporting || loading}
                      onChange={(event) => {
                        void seek(Number(event.target.value)).catch(handleFailure);
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="upload-symbol">
                    {loading ? (
                      <LoaderCircle className="spin" size={23} />
                    ) : (
                      <Upload size={23} strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="drop-copy">
                    <h3>
                      {loading ? "Listening to your track…" : "Drop your track. Begin the journey."}
                    </h3>
                    <p>
                      {loading
                        ? "Finding the shape of your sound"
                        : "MP3 or WAV · Up to 150 MB · Stays on your device"}
                    </p>
                  </div>
                  <button
                    className="button button-lime"
                    type="button"
                    disabled={loading}
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose a track
                    <ArrowRight size={15} />
                  </button>
                </>
              )}
            </section>
            {!track && (
              <div className="demo-row">
                <span>Just exploring?</span>
                <button
                  type="button"
                  className="text-button demo-button"
                  disabled={loading || Boolean(visualError)}
                  onClick={() => {
                    void loadTrack();
                  }}
                >
                  Try a demo track <ArrowRight size={13} />
                </button>
                <span className="demo-credit">Voltage / 128 — Afterglow</span>
              </div>
            )}

            <div className={`journey ${!track ? "journey-empty" : ""}`}>
              <div className="journey-heading">
                <span className="panel-label">
                  <Waves size={14} /> THE JOURNEY
                </span>
                <span>{track ? "Shaped by your track" : "One track. A full set."}</span>
              </div>
              <div className="chapter-strip">
                {analysis.chapters.map((item, index) => (
                  <button
                    className={`chapter ${chapter === index && track ? "active" : ""}`}
                    key={item.name}
                    type="button"
                    disabled={!track || exporting || loading}
                    onClick={() => {
                      void seek(item.start * (track?.duration ?? 0)).catch(handleFailure);
                    }}
                    style={
                      {
                        "--chapter-color": ["#7d98ad", "#aba7d3", "#c1a3bc", "#e8b481", "#d2f6a5"][
                          index
                        ],
                      } as CSSProperties
                    }
                  >
                    <span className="chapter-line" />
                    <span className="chapter-name">
                      <span>0{index + 1}</span>
                      {item.name}
                    </span>
                    <span className="chapter-time">
                      {track
                        ? formatTime(item.start * track.duration)
                        : [
                            "Lights on",
                            "Start the climb",
                            "Into the tunnel",
                            "Full pressure",
                            "One last hit",
                          ][index]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="inspector">
            <div className="inspector-title">
              <div>
                <span className="eyebrow">CREATIVE DIRECTION</span>
                <h2>Make it yours.</h2>
              </div>
              <Sparkles size={20} strokeWidth={1.3} />
            </div>
            <fieldset disabled={exporting}>
              <legend className="sr-only">Visual settings</legend>
              <div className="control-section artist-section">
                <label htmlFor={`${id}-artist`}>Artist name</label>
                <input
                  id={`${id}-artist`}
                  type="text"
                  maxLength={40}
                  value={artist}
                  onChange={(event) => setArtist(event.target.value)}
                  placeholder="YOUR NAME HERE"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-artist-hint`}
                />
                <p id={`${id}-artist-hint`}>
                  Your name follows the show cues. Play to see your entrance.
                </p>
              </div>
              <div className="control-section">
                <div className="section-heading">
                  <h3>Choose your world</h3>
                  <span>03</span>
                </div>
                <div className="scene-list">
                  {scenes.map((item, index) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`scene-card ${!footage && activeScene === index ? "selected" : ""}`}
                      aria-pressed={!footage && activeScene === index}
                      onClick={() => {
                        removeFootage();
                        setScene(index);
                        setActiveScene(index);
                        setDirector(false);
                      }}
                    >
                      <span
                        className="scene-thumbnail"
                        style={{ backgroundImage: `url(/worlds/${profile}-${index}.webp)` }}
                      />
                      <span className="scene-card-copy">
                        <strong>{item.name}</strong>
                        <small>{item.type}</small>
                      </span>
                      <span className="scene-check">
                        {!footage && activeScene === index ? (
                          <Check size={11} strokeWidth={3} />
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="control-section footage-section">
                <div className="section-heading">
                  <h3>Your animation</h3>
                  <span>OPTIONAL</span>
                </div>
                <input
                  ref={footageInput}
                  className="sr-only"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  aria-label="Upload animation"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void loadFootage(file);
                    }
                  }}
                />
                {footage ? (
                  <div className="footage-file">
                    <Film size={15} />
                    <span>{footage.name}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove animation"
                      onClick={removeFootage}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="footage-upload"
                  disabled={footageLoading}
                  onClick={() => footageInput.current?.click()}
                >
                  {footageLoading ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {footageLoading
                    ? "Loading animation…"
                    : footage
                      ? "Replace animation"
                      : "Add animation clip"}
                </button>
                <p>
                  Bring your own CGI or VJ loop. MP4 / WebM / MOV · stays on your device. Clips loop
                  for the full track with your title and lighting.
                </p>
              </div>
              <div className="control-section color-section">
                <div className="section-heading">
                  <h3>Color story</h3>
                  <span>{palettes[palette] ?? "Custom"}</span>
                </div>
                <div className="palette-options">
                  {palettes.map((item, index) => (
                    <button
                      className={`palette palette-${index} ${palette === index ? "selected" : ""}`}
                      type="button"
                      key={item}
                      aria-label={item}
                      aria-pressed={palette === index}
                      onClick={() => {
                        setPalette(index);
                        const preset = colorPresets[index];
                        if (preset) {
                          setColors(preset.colors);
                        }
                      }}
                    >
                      <span />
                      {palette === index && <Check size={12} />}
                    </button>
                  ))}
                </div>
                <div className="custom-colors">
                  {["Primary", "Secondary", "Accent"].map((label, index) => (
                    <label key={label}>
                      <span>{label}</span>
                      <input
                        type="color"
                        aria-label={`${label} color`}
                        value={colors[index]}
                        onChange={(event) => {
                          const next = [...colors] as [string, string, string];
                          next[index] = event.target.value;
                          setColors(next);
                          setPalette(-1);
                        }}
                      />
                      <span className="color-hex">{colors[index]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="control-section dynamics-section">
                <div className="slider-heading">
                  <label htmlFor={`${id}-intensity`}>Impact</label>
                  <output htmlFor={`${id}-intensity`}>
                    {intensity}
                    <span>%</span>
                  </output>
                </div>
                <input
                  id={`${id}-intensity`}
                  className="control-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={intensity}
                  style={{ "--value": `${intensity}%` } as CSSProperties}
                  onChange={(event) => setIntensity(Number(event.target.value))}
                />
                <div className="slider-endpoints">
                  <span>Punchy</span>
                  <span>Full send</span>
                </div>
                <div className="slider-heading motion-heading">
                  <label htmlFor={`${id}-motion`}>Velocity</label>
                  <output htmlFor={`${id}-motion`}>
                    {motion}
                    <span>%</span>
                  </output>
                </div>
                <input
                  id={`${id}-motion`}
                  className="control-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={motion}
                  style={{ "--value": `${motion}%` } as CSSProperties}
                  onChange={(event) => setMotion(Number(event.target.value))}
                />
                <div className="slider-endpoints">
                  <span>Cruise</span>
                  <span>Warp speed</span>
                </div>
              </div>
              <div className="grain-row director-row">
                <div>
                  <label htmlFor={`${id}-auto-director`}>Auto director</label>
                  <span>Switch worlds every 16 kicks.</span>
                </div>
                <button
                  id={`${id}-auto-director`}
                  className={`switch ${director && !reducedMotion ? "on" : ""}`}
                  role="switch"
                  aria-checked={director && !reducedMotion}
                  aria-label="Auto director"
                  type="button"
                  disabled={reducedMotion}
                  onClick={() => setDirector(!director)}
                >
                  <span />
                </button>
              </div>
              <div className="grain-row">
                <div>
                  <label htmlFor={`${id}-film-grain`}>Film grain</label>
                  <span>A little texture. A lot of feeling.</span>
                </div>
                <button
                  id={`${id}-film-grain`}
                  className={`switch ${grain ? "on" : ""}`}
                  role="switch"
                  aria-checked={grain}
                  aria-label="Film grain"
                  type="button"
                  onClick={() => setGrain(!grain)}
                >
                  <span />
                </button>
              </div>
              <div className="grain-row flash-row">
                <div>
                  <label htmlFor={`${id}-impact-flashes`}>Impact flashes</label>
                  <span>Transient hits. No free-running strobe.</span>
                </div>
                <button
                  id={`${id}-impact-flashes`}
                  className={`switch ${flashes && !reducedMotion ? "on" : ""}`}
                  role="switch"
                  aria-checked={flashes && !reducedMotion}
                  aria-label="Impact flashes"
                  type="button"
                  disabled={reducedMotion}
                  onClick={() => setFlashes(!flashes)}
                >
                  <span />
                </button>
              </div>
            </fieldset>
            <div className="inspector-note">
              <span className="note-spark">✳</span>
              <p>
                Your show. Your signature.
                <br />
                <span>Animation, lighting, and identity.</span>
              </p>
            </div>
          </aside>
        </div>

        <footer>
          <span>
            <Orbit size={14} /> Made for music that takes you somewhere.
          </span>
          <span>NO UPLOADS. NO LIMITS ON IMAGINATION.</span>
          <span className="footer-version">AFTERGLOW / VOL. 01</span>
        </footer>
      </main>

      {exporting && (
        <div className="export-progress" role="status">
          <LoaderCircle className="spin" size={20} />
          <div>
            <strong>Rendering your journey · {Math.round(progress * 100)}%</strong>
            <span>
              Keep this tab visible · {formatTime((track?.duration ?? 0) - time)} remaining
            </span>
          </div>
          <button className="text-button" type="button" onClick={cancelExport}>
            Cancel
          </button>
        </div>
      )}
      {(error || notice) && (
        <div className={`toast ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          <span>{error ?? notice}</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        className="modal"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        aria-labelledby={`${id}-dialog-title`}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          type="button"
          onClick={() => setModal(null)}
        >
          <X size={19} />
        </button>
        {modal === "help" ? (
          <>
            <span className="modal-icon">
              <Headphones size={25} />
            </span>
            <span className="eyebrow">SOUND BECOMES A PLACE</span>
            <h2 id={`${id}-dialog-title`}>Follow your sound.</h2>
            <p>
              Drop in an MP3 or WAV. Kicks punch the camera, midrange transients fire snare sweeps,
              and high frequencies light up the lasers. Auto director switches worlds every 16
              detected kicks.
            </p>
            <ol className="help-steps">
              <li>
                <strong>Bring your music.</strong>
                <span>Up to 150 MB and 30 minutes. Everything stays in your browser.</span>
              </li>
              <li>
                <strong>Set the feeling.</strong>
                <span>Add your artist name, choose a world, and make the lighting your own.</span>
              </li>
              <li>
                <strong>Take it with you.</strong>
                <span>Export a film with your audio, or go fullscreen and get lost.</span>
              </li>
            </ol>
            <div className="modal-footnote">
              Space to play or pause · Double-click the canvas for fullscreen
              {reducedMotion ? " · Reduced motion is enabled" : ""}
            </div>
          </>
        ) : (
          <>
            <span className="modal-icon">
              <Film size={25} />
            </span>
            <span className="eyebrow">READY FOR THE OUTSIDE WORLD</span>
            <h2 id={`${id}-dialog-title`}>Take the journey with you.</h2>
            <p>
              Your full track, rendered from the first note to the final fade. Original audio
              included.
            </p>
            <div className="export-summary">
              <div>
                <span>Profile</span>
                <strong>{showProfile.name}</strong>
              </div>
              {footage && (
                <div>
                  <span>Animation</span>
                  <strong>{footage.name}</strong>
                </div>
              )}
              {artist.trim() && (
                <div>
                  <span>Artist</span>
                  <strong>{artist.trim()}</strong>
                </div>
              )}
              <div>
                <span>Track</span>
                <strong>{track?.name}</strong>
              </div>
              <div>
                <span>Format</span>
                <strong>{ratios[ratioIndex]?.name} · 1080p · 30 fps</strong>
              </div>
              <div>
                <span>Video</span>
                <strong>
                  {getRecordingType()?.includes("mp4") ? "MP4" : "WebM"} · Audio included
                </strong>
              </div>
              <div>
                <span>Render time</span>
                <strong>About {formatTime(track?.duration ?? 0)}</strong>
              </div>
            </div>
            <p className="export-note">
              The film records in real time. Keep this tab visible until it finishes; your download
              will start automatically.
            </p>
            {getRecordingType() ? (
              <button
                className="button button-lime render-button"
                type="button"
                onClick={() => {
                  void startExport().catch(handleFailure);
                }}
              >
                <Film size={16} /> Render film <ArrowRight size={16} />
              </button>
            ) : (
              <p role="alert">This browser does not support video export. Try Chrome or Edge.</p>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
