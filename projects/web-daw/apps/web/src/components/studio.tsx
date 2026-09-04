import {
  ArrowDownToLine,
  AudioLines,
  Check,
  Circle,
  CircleHelp,
  Copy,
  Disc3,
  Headphones,
  LayoutList,
  Link2,
  Maximize2,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Redo2,
  Repeat2,
  Save,
  SlidersHorizontal,
  Square,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AudioEngine } from "../lib/audio";
import { defaultPreset, effects, type Sound, soundById, sounds } from "../lib/catalog";
import {
  type Clip,
  decodeSession,
  demoSession,
  demos,
  encodeSession,
  makeTrack,
  type Session,
  sessionSchema,
  type Track,
  uid,
} from "../lib/session";
import { ArrangementClip } from "./arrangement-clip";
import { LoopBrace } from "./loop-brace";
import { Browser, Devices, Mixer, NoteEditor } from "./panels";

const positions = (length: number) => Array.from({ length }, (_, position) => position);
const storageKey = "web-daw.session.v1";
const libraryKey = "web-daw.library.v1";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Studio() {
  const [session, setSession] = useState<Session>(() => demoSession());
  const latest = useRef(session);
  latest.current = session;
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("demo-0-5");
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const [arrangeCursor, setArrangeCursor] = useState(0);
  const clipClipboard = useRef<Clip | null>(null);
  const [meters, setMeters] = useState<Record<string, number> & { master?: number }>({});
  const [loop, setLoop] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [record, setRecord] = useState(false);
  const [panel, setPanel] = useState("Note editor");
  const [panelHeight, setPanelHeight] = useState(390);
  const panelDrag = useRef<{ y: number; height: number } | null>(null);
  const [modal, setModal] = useState<"new" | "help" | "share" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState<Session[]>([]);
  const [saveStatus, setSaveStatus] = useState("Opening session");
  const [zoom, setZoom] = useState(1);
  const history = useRef<Session[]>([]);
  const future = useRef<Session[]>([]);
  const [, refreshHistory] = useState(0);
  const engine = useRef<AudioEngine | null>(null);
  const generation = useRef(0);
  const track = session.tracks.find((t) => t.id === selected) ?? session.tracks[0]!;
  const activeClip = track.clips.find((clip) => clip.id === selectedClip) ?? track.clips[0];
  const editorTrack = activeClip?.pattern ? { ...track, ...activeClip.pattern } : track;
  const message = useCallback((text: string) => setToast(text), []);
  const error = useCallback(
    (cause: unknown) =>
      message(cause instanceof Error ? cause.message : "Something went wrong. Please try again."),
    [message],
  );
  const edit = useCallback((next: Session) => {
    setSaveStatus("Saving…");
    history.current = [...history.current.slice(-49), latest.current];
    future.current = [];
    latest.current = next;
    setSession(next);
    refreshHistory((n) => n + 1);
  }, []);
  const editTrack = useCallback(
    (next: Track) =>
      edit({
        ...latest.current,
        tracks: latest.current.tracks.map((t) => (t.id === next.id ? next : t)),
      }),
    [edit],
  );
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (previous) {
      setSaveStatus("Saving…");
      future.current.push(latest.current);
      latest.current = previous;
      setSession(previous);
      refreshHistory((n) => n + 1);
    }
  }, []);
  const editPattern = useCallback(
    (next: Track) => {
      if (activeClip) {
        editTrack({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === activeClip.id
              ? { ...clip, pattern: { length: next.length, notes: next.notes } }
              : clip,
          ),
        });
      } else {
        editTrack(next);
      }
    },
    [activeClip, track, editTrack],
  );
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      setSaveStatus("Saving…");
      history.current.push(latest.current);
      latest.current = next;
      setSession(next);
      refreshHistory((n) => n + 1);
    }
  }, []);
  useEffect(() => {
    let canceled = false;
    const audio = new AudioEngine(latest.current);
    engine.current = audio;
    audio.onTick = (step, active, levels) => {
      positionRef.current = step;
      setPosition(step);
      setPlaying(active);
      setMeters(levels);
    };
    async function restore() {
      try {
        const library = JSON.parse(localStorage.getItem(libraryKey) ?? "[]") as unknown;
        if (Array.isArray(library)) {
          setSaved(
            library
              .map((s) => sessionSchema.safeParse(s))
              .filter((result) => result.success)
              .map((result) => result.data as Session)
              .slice(0, 12),
          );
        }
      } catch {
        message("Saved-session library could not be opened.");
      }
      try {
        const shared = window.location.hash.startsWith("#session=")
          ? window.location.hash.slice(9)
          : null;
        const stored = localStorage.getItem(storageKey);
        const restored = shared
          ? await decodeSession(shared)
          : stored
            ? sessionSchema.parse(JSON.parse(stored))
            : null;
        if (!canceled && restored) {
          latest.current = restored;
          setSession(restored);
          setSelected(restored.tracks[0]!.id);
          if (shared) {
            message("Shared session loaded. Make it yours.");
            // Subsequent reloads restore local edits instead of re-importing the original snapshot.
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      } catch {
        message("Could not open the saved session. A fresh demo is ready to play.");
      } finally {
        if (!canceled) {
          setReady(true);
        }
      }
    }
    void restore();
    const onHashChange = () => {
      if (window.location.hash.startsWith("#session=")) {
        setSaveStatus("Opening session");
        setModal(null);
        setSelectedClip(null);
        audio.startStep = 0;
        audio.stop();
        setReady(false);
        void restore();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      canceled = true;
      generation.current++;
      audio.dispose();
    };
  }, [message]);
  useEffect(() => {
    if (!ready) {
      return;
    }
    setSaveStatus("Saving…");
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        setSaveStatus("Saved on this device");
      } catch {
        setSaveStatus("Storage unavailable");
        message("Autosave is unavailable. Use Share to keep a copy of your session.");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [session, ready, message]);
  useEffect(() => {
    if (engine.current) {
      engine.current.update(session);
      void engine.current
        .loadSamples(engine.current.context ?? new OfflineAudioContext(1, 1, 22050), session.tracks)
        .catch(error);
    }
  }, [session, error]);
  useEffect(() => {
    if (engine.current) {
      engine.current.loop = loop;
      engine.current.metronome = metronome;
    }
  }, [loop, metronome]);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const stop = useCallback(() => {
    generation.current++;
    if (engine.current) {
      engine.current.startStep = 0;
      engine.current.stop();
    }
    setStarting(false);
    positionRef.current = 0;
    setPosition(0);
    setPlaying(false);
  }, []);
  const play = useCallback(async () => {
    if (!engine.current || starting) {
      return;
    }
    if (engine.current.playing) {
      const step = engine.current.position();
      engine.current.startStep = step;
      engine.current.stop();
      return;
    }
    const token = ++generation.current;
    setStarting(true);
    try {
      await engine.current.play(Math.floor(positionRef.current));
      if (token !== generation.current) {
        engine.current.stop();
      }
    } catch (cause) {
      error(cause);
    } finally {
      setStarting(false);
    }
  }, [starting, error]);
  const archive = useCallback(() => {
    const list = [latest.current, ...saved.filter((s) => s.name !== latest.current.name)].slice(
      0,
      12,
    );
    try {
      localStorage.setItem(libraryKey, JSON.stringify(list));
      setSaved(list);
      message("Session saved to your library.");
    } catch {
      error(new Error("Could not save the library. Use Share to keep a session link."));
    }
  }, [saved, message, error]);
  const load = useCallback(
    (next: Session) => {
      archive();
      stop();
      edit(next);
      setSelected(next.tracks[0]!.id);
      setSelectedClip(null);
      setModal(null);
      window.history.replaceState(null, "", window.location.pathname);
    },
    [archive, stop, edit],
  );
  const preview = useCallback(
    (sound: Sound) => {
      void engine.current
        ?.preview(
          makeTrack(sound.id, 0),
          sound.kind === "synth" && sound.family === "Bass" ? 36 : 60,
        )
        .catch(error);
    },
    [error],
  );
  const addSound = useCallback(
    (sound: Sound) => {
      if (latest.current.tracks.length >= 24) {
        message("This session has 24 tracks. Remove one to add another.");
        return;
      }
      const next = makeTrack(sound.id, latest.current.tracks.length);
      edit({ ...latest.current, tracks: [...latest.current.tracks, next] });
      setSelected(next.id);
      setSelectedClip(null);
      setPanel("Note editor");
      message(`${sound.name} added. Draw notes or play the A–K keys.`);
    },
    [edit, message],
  );
  const audition = useCallback(
    (pitch: number) => {
      void engine.current?.preview(track, pitch).catch(error);
    },
    [track, error],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable ||
        modal
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void play();
        return;
      }
      if (event.key === "Escape") {
        stop();
        return;
      }
      if (event.shiftKey && event.key === "Tab") {
        event.preventDefault();
        setPanel((current) => (current === "Note editor" ? "Devices" : "Note editor"));
        return;
      }
      const clip = track.clips.find((c) => c.id === selectedClip);
      if ((event.key === "Delete" || event.key === "Backspace") && clip) {
        event.preventDefault();
        editTrack({ ...track, clips: track.clips.filter((c) => c.id !== clip.id) });
        setSelectedClip(null);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if ((key === "c" || key === "x") && clip) {
          event.preventDefault();
          clipClipboard.current = structuredClone({
            ...clip,
            pattern: clip.pattern ?? { length: track.length, notes: track.notes },
          });
          if (key === "x") {
            editTrack({ ...track, clips: track.clips.filter((c) => c.id !== clip.id) });
            setSelectedClip(null);
          }
        }
        if (key === "d" || key === "v") {
          event.preventDefault();
          const original = key === "d" ? clip : clipClipboard.current;
          if (!original) {
            return;
          }
          const start = key === "d" ? original.start + original.bars : arrangeCursor;
          if (
            start + original.bars > latest.current.bars ||
            track.clips.some((c) => start < c.start + c.bars && start + original.bars > c.start)
          ) {
            message("Choose an empty area for the copied clip.");
            return;
          }
          const next = {
            ...original,
            id: uid(),
            start,
            pattern: original.pattern ?? { length: track.length, notes: track.notes },
          };
          editTrack({ ...track, clips: [...track.clips, next] });
          setSelectedClip(next.id);
          setArrangeCursor(start + next.bars);
        }
        if (key === "l" && clip) {
          event.preventDefault();
          edit({ ...latest.current, loop: { start: clip.start, end: clip.start + clip.bars } });
          setLoop(true);
          const step = clip.start * 16;
          positionRef.current = step;
          setPosition(step);
          if (engine.current) {
            engine.current.startStep = step;
            if (engine.current.playing) {
              void engine.current.play(step).catch(error);
            }
          }
        }
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          archive();
        }
        return;
      }
      if (event.repeat) {
        return;
      }
      const keys = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];
      const offset = keys.indexOf(event.key.toLowerCase());
      if (offset >= 0) {
        const pitch = (soundById(track.sound).family === "Bass" ? 36 : 60) + offset;
        audition(pitch);
        if (record && engine.current?.playing) {
          const songStep = Math.floor(engine.current.position());
          const recordingClip = track.clips.find(
            (item) => songStep >= item.start * 16 && songStep < (item.start + item.bars) * 16,
          );
          if (!recordingClip) {
            message("Add a clip at this position before recording notes.");
            return;
          }
          const pattern = recordingClip.pattern ?? track;
          const step =
            (songStep - recordingClip.start * 16 + (recordingClip.offset ?? 0)) % pattern.length;
          const notes = [
            ...pattern.notes.filter((n) => n.step !== step || n.pitch !== pitch),
            { step, pitch, duration: Math.min(2, pattern.length - step), velocity: 0.8 },
          ];
          editTrack({
            ...track,
            clips: track.clips.map((item) =>
              item.id === recordingClip.id
                ? { ...item, pattern: { length: pattern.length, notes } }
                : item,
            ),
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    play,
    stop,
    undo,
    redo,
    archive,
    track,
    audition,
    record,
    editTrack,
    modal,
    message,
    selectedClip,
    arrangeCursor,
    edit,
    error,
  ]);
  const exportAudio = async () => {
    if (!engine.current) {
      return;
    }
    setExporting(true);
    try {
      const blob = await engine.current.exportWav(latest.current);
      download(blob, `${latest.current.name.replace(/[^a-z0-9 -]/gi, "") || "Web DAW"}.wav`);
      message("Your stereo WAV is ready. Go make some noise.");
    } catch (cause) {
      error(cause);
    } finally {
      setExporting(false);
    }
  };
  const share = async () => {
    try {
      const code = await encodeSession(latest.current);
      const url = `${window.location.origin}/#session=${code}`;
      setShareUrl(url);
      setModal("share");
    } catch (cause) {
      error(cause);
    }
  };
  function seek(bar: number) {
    setArrangeCursor(bar);
    const step = bar * 16;
    positionRef.current = step;
    setPosition(step);
    if (engine.current) {
      engine.current.startStep = step;
      if (engine.current.playing) {
        void engine.current.play(step).catch(error);
      }
    }
  }
  const addClip = (target: Track, start: number) => {
    const bars = Math.min(target.length / 16, session.bars - start);
    if (target.clips.some((c) => start < c.start + c.bars && start + bars > c.start)) {
      return;
    }
    const clip = { id: uid(), start, bars, pattern: { length: target.length, notes: [] } };
    editTrack({ ...target, clips: [...target.clips, clip] });
    setSelected(target.id);
    setSelectedClip(clip.id);
    setPanel("Note editor");
  };
  function duplicateClip() {
    const clip = track.clips.find((c) => c.id === selectedClip);
    if (!clip) {
      return;
    }
    const start = clip.start + clip.bars;
    if (
      start + clip.bars > session.bars ||
      track.clips.some((c) => start < c.start + c.bars && start + clip.bars > c.start)
    ) {
      message("Leave space after this clip before duplicating it.");
      return;
    }
    const next = {
      ...clip,
      pattern: clip.pattern ?? { length: track.length, notes: track.notes },
      id: uid(),
      start,
    };
    editTrack({ ...track, clips: [...track.clips, next] });
    setSelectedClip(next.id);
  }
  return (
    <main className="studio">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Web DAW home">
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            web<span className="brand-light">daw</span>
            <small>THE BROWSER IS YOUR STUDIO</small>
          </span>
        </a>
        <div className="project-name">
          <input
            aria-label="Session name"
            disabled={!ready}
            maxLength={80}
            value={session.name}
            onChange={(e) => edit({ ...session, name: e.target.value || "Untitled" })}
          />
          <span className="project-badge">PROJECT</span>
          <span className="save-state">
            <Check size={12} />
            {saveStatus}
          </span>
        </div>
        <div className="header-actions">
          <button type="button" aria-label="New session" onClick={() => setModal("new")}>
            <Plus size={15} />
            <span>New session</span>
          </button>
          <IconButton label="Save session to library" onClick={archive}>
            <Save size={16} />
          </IconButton>
          <IconButton label="Help and shortcuts" onClick={() => setModal("help")}>
            <CircleHelp size={17} />
          </IconButton>
          <button
            type="button"
            aria-label="Share"
            className="share-button"
            onClick={() => void share()}
          >
            <Link2 size={14} />
            <span>Share</span>
          </button>
          <button
            type="button"
            className="export-button"
            aria-label={exporting ? "Rendering WAV" : "Export WAV"}
            onClick={() => void exportAudio()}
            disabled={exporting || !ready}
          >
            <ArrowDownToLine size={15} />
            {exporting ? "Rendering…" : "Export WAV"}
          </button>
        </div>
      </header>
      <div className="transport">
        <div className="transport-left">
          <IconButton label="Undo" disabled={history.current.length === 0} onClick={undo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo" disabled={future.current.length === 0} onClick={redo}>
            <Redo2 size={16} />
          </IconButton>
          <span className="separator" />
          <span className="transport-project">
            <span className="green-dot" />
            STUDIO
          </span>
        </div>
        <div className="transport-center">
          <IconButton label="Stop" onClick={stop}>
            <Square size={15} fill="currentColor" />
          </IconButton>
          <IconButton
            label={playing ? "Pause" : "Play"}
            className="play-button"
            disabled={!ready || starting}
            active={playing}
            onClick={() => void play()}
          >
            {playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </IconButton>
          <IconButton
            label="Record computer keyboard"
            className="record-button"
            active={record}
            onClick={() => {
              setRecord(!record);
              if (!record) {
                message("Recording armed. Press play, then use A–K to record notes.");
              }
            }}
          >
            <Circle size={14} fill={record ? "currentColor" : "none"} />
          </IconButton>
          <span className="separator" />
          <div className="position-display" data-testid="position">
            {String(Math.floor(position / 16) + 1).padStart(2, "0")}
            <span>.</span>
            {Math.floor((position % 16) / 4) + 1}
            <span>.</span>
            {Math.floor(position % 4) + 1}
          </div>
          <span className="separator" />
          <label className="tempo">
            <input
              aria-label="Tempo"
              key={session.bpm}
              type="number"
              min={50}
              max={200}
              defaultValue={session.bpm}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                const entered = event.currentTarget.valueAsNumber;
                const value = Number.isFinite(entered)
                  ? Math.max(50, Math.min(200, entered))
                  : session.bpm;
                event.currentTarget.value = String(value);
                if (value !== session.bpm) {
                  edit({ ...session, bpm: value });
                }
              }}
            />
            <span>BPM</span>
          </label>
          <span className="time-signature">4 / 4</span>
          <IconButton label="Loop arrangement" active={loop} onClick={() => setLoop(!loop)}>
            <Repeat2 size={18} />
          </IconButton>
          <IconButton label="Metronome" active={metronome} onClick={() => setMetronome(!metronome)}>
            <Radio size={17} />
          </IconButton>
          <label className="swing">
            SWING
            <input
              aria-label="Swing"
              type="range"
              min={0}
              max={0.45}
              step={0.01}
              value={session.swing}
              onChange={(e) => edit({ ...session, swing: Number(e.target.value) })}
            />
            <span>{Math.round(session.swing * 100)}%</span>
          </label>
        </div>
        <div className="transport-right">
          <Volume2 size={14} />
          <div className="master-mini">
            <i style={{ width: `${Math.min(100, (meters["master"] ?? 0) * 260)}%` }} />
          </div>
          <span>MASTER</span>
        </div>
      </div>
      <div className="workspace">
        <Browser
          onPreview={preview}
          onAdd={addSound}
          onEffect={(id) => {
            editTrack({
              ...track,
              effects: { ...track.effects, [id]: { ...track.effects[id], enabled: true } },
            });
            setPanel("Devices");
            message(`${effects.find((f) => f.id === id)?.name} enabled on ${track.name}.`);
          }}
          onDemo={(id) => load(demoSession(id))}
          saved={saved}
          onLoad={load}
        />
        <div className="main-workspace">
          <div className="arrangement-toolbar">
            <div>
              <LayoutList size={15} />
              <strong>Arrangement</strong>
              <span>{session.tracks.length} TRACKS</span>
            </div>
            <div>
              {activeClip && (
                <select
                  aria-label="Selected clip length"
                  value={activeClip.bars}
                  onChange={(event) => {
                    const bars = Number(event.target.value);
                    if (
                      activeClip.start + bars > session.bars ||
                      track.clips.some(
                        (clip) =>
                          clip.id !== activeClip.id &&
                          activeClip.start < clip.start + clip.bars &&
                          activeClip.start + bars > clip.start,
                      )
                    ) {
                      message("There is not enough space to extend this clip.");
                      return;
                    }
                    editTrack({
                      ...track,
                      clips: track.clips.map((clip) =>
                        clip.id === activeClip.id ? { ...clip, bars } : clip,
                      ),
                    });
                  }}
                >
                  {[1, 2, 4, 8, 16].map((bars) => (
                    <option key={bars} value={bars}>
                      {bars} bar clip
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                title="Duplicate selected clip"
                disabled={!selectedClip}
                onClick={duplicateClip}
              >
                <Copy size={13} /> Duplicate
              </button>
              <IconButton
                label="Delete selected clip"
                disabled={!selectedClip}
                onClick={() => {
                  editTrack({ ...track, clips: track.clips.filter((c) => c.id !== selectedClip) });
                  setSelectedClip(null);
                }}
              >
                <Trash2 size={13} />
              </IconButton>
              <label className="bars-select">
                <select
                  aria-label="Arrangement length"
                  value={session.bars}
                  onChange={(e) => {
                    const bars = Number(e.target.value);
                    edit({
                      ...session,
                      bars,
                      ...(session.loop
                        ? {
                            loop: {
                              start: Math.min(session.loop.start, bars - 1),
                              end: Math.min(session.loop.end, bars),
                            },
                          }
                        : {}),
                      tracks: session.tracks.map((t) => ({
                        ...t,
                        clips: t.clips
                          .filter((c) => c.start < bars)
                          .map((c) => ({ ...c, bars: Math.min(c.bars, bars - c.start) })),
                      })),
                    });
                    stop();
                  }}
                >
                  {[8, 16, 32, 64].map((n) => (
                    <option key={n} value={n}>
                      {n} bars
                    </option>
                  ))}
                </select>
              </label>
              <IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(zoom - 0.5)}>
                <Minus size={14} />
              </IconButton>
              <IconButton label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(zoom + 0.5)}>
                <Plus size={14} />
              </IconButton>
              <IconButton label="Fit arrangement" onClick={() => setZoom(1)}>
                <Maximize2 size={13} />
              </IconButton>
            </div>
          </div>
          <section
            className="arrangement-scroll"
            aria-label="Track arrangement"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("application/sound");
              const sound = sounds.find((s) => s.id === id);
              if (sound) {
                e.preventDefault();
                addSound(sound);
              }
            }}
          >
            <div className="arrangement" style={{ minWidth: `${760 * zoom}px` }}>
              <div className="timeline-row">
                <div className="track-column timeline-label">
                  <span>TRACK / DEVICE</span>
                  <span>LEVEL</span>
                </div>
                <div
                  className="timeline"
                  style={{ gridTemplateColumns: `repeat(${session.bars},1fr)` }}
                >
                  {positions(session.bars).map((i) => (
                    <button
                      key={`position-${i}`}
                      type="button"
                      aria-label={`Seek to bar ${i + 1}`}
                      className={i % 4 === 0 ? "major" : ""}
                      onClick={() => seek(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="section-row">
                <div className="track-column">
                  <span className="subtle">{loop ? "LOOP ON" : "ONE PASS"}</span>
                </div>
                <LoopBrace
                  start={session.loop?.start ?? 0}
                  end={session.loop?.end ?? session.bars}
                  bars={session.bars}
                  enabled={loop}
                  onChange={(start, end) => edit({ ...session, loop: { start, end } })}
                />
              </div>
              {session.tracks.map((item, i) => (
                <div
                  key={item.id}
                  className={`track-row ${selected === item.id ? "selected" : ""} ${item.muted ? "is-muted" : ""}`}
                  style={{ "--track-color": item.color } as CSSProperties}
                >
                  <div className="track-column">
                    <button
                      type="button"
                      className="track-select"
                      onClick={() => {
                        setSelected(item.id);
                        setSelectedClip(null);
                      }}
                    >
                      <span className="track-number">{String(i + 1).padStart(2, "0")}</span>
                      <span className="track-details">
                        <strong>{item.name}</strong>
                        <small>
                          {soundById(item.sound).kind === "sample" ? (
                            <Disc3 size={10} />
                          ) : (
                            <Music2 size={10} />
                          )}{" "}
                          {soundById(item.sound).name}
                        </small>
                      </span>
                    </button>
                    <div className="track-controls">
                      <button
                        type="button"
                        className={item.muted ? "muted" : ""}
                        aria-label={`Mute ${item.name}`}
                        aria-pressed={item.muted}
                        onClick={() => editTrack({ ...item, muted: !item.muted })}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        className={item.solo ? "solo" : ""}
                        aria-label={`Solo ${item.name}`}
                        aria-pressed={item.solo}
                        onClick={() => editTrack({ ...item, solo: !item.solo })}
                      >
                        S
                      </button>
                      <div className="track-meter">
                        <i style={{ height: `${Math.min(100, (meters[item.id] ?? 0) * 350)}%` }} />
                      </div>
                    </div>
                  </div>
                  <div
                    className="track-lane"
                    role="application"
                    aria-label={`${item.name} clips. Enter adds a clip at the playhead.`}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: This arrangement surface handles Enter to add clips without a pointer.
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addClip(item, Math.floor(position / 16));
                      }
                    }}
                    style={{ backgroundSize: `${100 / session.bars}% 100%` }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const raw = e.dataTransfer.getData("application/clip");
                      if (!raw) {
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      const data = JSON.parse(raw) as {
                        trackId: string;
                        id: string;
                        offset?: number;
                        copy?: boolean;
                      };
                      const source = session.tracks.find((t) => t.id === data.trackId);
                      const original = source?.clips.find((c) => c.id === data.id);
                      if (!source || !original) {
                        return;
                      }
                      const box = e.currentTarget.getBoundingClientRect();
                      const start = Math.max(
                        0,
                        Math.min(
                          session.bars - original.bars,
                          Math.floor(((e.clientX - box.left) / box.width) * session.bars) -
                            (data.offset ?? 0),
                        ),
                      );
                      const copy = data.copy || e.altKey;
                      if (
                        item.clips.some(
                          (c) =>
                            (copy || c.id !== original.id) &&
                            start < c.start + c.bars &&
                            start + original.bars > c.start,
                        )
                      ) {
                        message("That space is occupied. Move the clip to an empty area.");
                        return;
                      }
                      const moved = {
                        ...original,
                        id: copy ? uid() : original.id,
                        start,
                        pattern: original.pattern ?? { length: source.length, notes: source.notes },
                      };
                      edit({
                        ...session,
                        tracks: session.tracks.map((t) => {
                          const clips =
                            !copy && t.id === source.id
                              ? t.clips.filter((c) => c.id !== original.id)
                              : t.clips;
                          return { ...t, clips: t.id === item.id ? [...clips, moved] : clips };
                        }),
                      });
                      setSelected(item.id);
                      setSelectedClip(moved.id);
                      setArrangeCursor(start);
                    }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) {
                        return;
                      }
                      const box = e.currentTarget.getBoundingClientRect();
                      setArrangeCursor(
                        Math.floor(((e.clientX - box.left) / box.width) * session.bars),
                      );
                      setSelected(item.id);
                      setSelectedClip(null);
                    }}
                    onDoubleClick={(e) => {
                      if (e.target !== e.currentTarget) {
                        return;
                      }
                      const box = e.currentTarget.getBoundingClientRect();
                      addClip(
                        item,
                        Math.floor(((e.clientX - box.left) / box.width) * session.bars),
                      );
                    }}
                  >
                    {item.clips.map((clip: Clip) => (
                      <ArrangementClip
                        key={clip.id}
                        clip={clip}
                        track={item}
                        bars={session.bars}
                        selected={selectedClip === clip.id}
                        onSelect={() => {
                          setSelected(item.id);
                          setSelectedClip(clip.id);
                          setArrangeCursor(clip.start);
                        }}
                        onOpen={() => {
                          setSelected(item.id);
                          setSelectedClip(clip.id);
                          setPanel("Note editor");
                        }}
                        onResize={(next) => {
                          if (next.start === clip.start && next.bars === clip.bars) {
                            return;
                          }
                          if (
                            item.clips.some(
                              (c) =>
                                c.id !== clip.id &&
                                next.start < c.start + c.bars &&
                                next.start + next.bars > c.start,
                            )
                          ) {
                            return;
                          }
                          editTrack({
                            ...item,
                            clips: item.clips.map((c) => (c.id === clip.id ? next : c)),
                          });
                        }}
                      />
                    ))}
                    <div
                      className="playhead"
                      style={{ left: `${(position / (session.bars * 16)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="add-track-row">
                <button type="button" onClick={() => addSound(defaultPreset)}>
                  <Plus size={14} /> Add instrument track
                </button>
                <span>Drag a sound here · Double-click empty space to add a clip</span>
              </div>
              <div className="master-row">
                <div className="track-column">
                  <span>
                    <Volume2 size={14} />
                    Master
                  </span>
                  <strong>
                    {session.master === 0 ? "−∞" : (20 * Math.log10(session.master)).toFixed(1)} dB
                  </strong>
                </div>
                <div className="master-lane">
                  <span>Stereo out</span>
                  <div className="master-wave" aria-hidden="true">
                    {positions(90).map((i) => (
                      <i
                        key={`position-${i}`}
                        style={{ height: `${3 + Math.abs(Math.sin(i * 1.8)) * 12}px` }}
                      />
                    ))}
                  </div>
                  <span>LIMITER ON</span>
                </div>
              </div>
            </div>
          </section>
          <section
            className="bottom-panel"
            style={panel === "Note editor" ? { height: panelHeight } : undefined}
          >
            {panel === "Note editor" && (
              <button
                type="button"
                className="panel-resizer"
                aria-label="Resize note editor"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    setPanelHeight(Math.min(650, panelHeight + 30));
                  }
                  if (event.key === "ArrowDown") {
                    setPanelHeight(Math.max(250, panelHeight - 30));
                  }
                }}
                onPointerDown={(event) => {
                  panelDrag.current = { y: event.clientY, height: panelHeight };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (panelDrag.current) {
                    setPanelHeight(
                      Math.max(
                        250,
                        Math.min(
                          window.innerHeight * 0.72,
                          panelDrag.current.height + panelDrag.current.y - event.clientY,
                        ),
                      ),
                    );
                  }
                }}
                onPointerUp={() => {
                  panelDrag.current = null;
                }}
              />
            )}

            <div className="panel-tabs">
              <div>
                {["Note editor", "Devices", "Mixer"].map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    className={panel === name ? "active" : ""}
                    onClick={() => setPanel(name)}
                  >
                    {i === 0 ? (
                      <Music2 size={14} />
                    ) : i === 1 ? (
                      <SlidersHorizontal size={14} />
                    ) : (
                      <AudioLines size={14} />
                    )}{" "}
                    {name}
                    {name === "Devices" && (
                      <span>
                        {1 + Object.values(track.effects).filter((fx) => fx.enabled).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="selected-track-label">
                <i style={{ background: track.color }} />
                <input
                  aria-label="Track name"
                  maxLength={50}
                  value={track.name}
                  onChange={(e) => editTrack({ ...track, name: e.target.value || "Track" })}
                />
                <IconButton
                  label="Duplicate track"
                  disabled={session.tracks.length >= 24}
                  onClick={() => {
                    const copy = {
                      ...structuredClone(track),
                      id: uid(),
                      name: `${track.name.slice(0, 43)} copy`,
                      clips: track.clips.map((c) => ({ ...c, id: uid() })),
                    };
                    edit({ ...session, tracks: [...session.tracks, copy] });
                    setSelected(copy.id);
                  }}
                >
                  <Copy size={12} />
                </IconButton>
                <IconButton
                  label="Delete track"
                  disabled={session.tracks.length <= 1}
                  onClick={() => {
                    edit({ ...session, tracks: session.tracks.filter((t) => t.id !== track.id) });
                    setSelectedClip(null);
                  }}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
            </div>
            {panel === "Devices" ? (
              <Devices
                track={track}
                onChange={editTrack}
                onPreview={() => audition(soundById(track.sound).family === "Bass" ? 36 : 60)}
              />
            ) : panel === "Note editor" ? (
              <NoteEditor
                key={`${track.id}-${selectedClip ?? "pattern"}`}
                track={editorTrack}
                position={
                  activeClip
                    ? position >= activeClip.start * 16 &&
                      position < (activeClip.start + activeClip.bars) * 16
                      ? position - activeClip.start * 16 + (activeClip.offset ?? 0)
                      : -1
                    : position
                }
                onChange={editPattern}
                onPreview={audition}
              />
            ) : (
              <Mixer session={session} meters={meters} onChange={edit} onSelect={setSelected} />
            )}
          </section>
        </div>
      </div>
      <footer className="statusbar">
        <span>
          <span className="green-dot" />
          {playing ? "AUDIO RUNNING" : starting ? "LOADING SOUNDS" : "READY WHEN YOU ARE"}
        </span>
        <span>
          {record ? (
            <>
              <Circle size={9} fill="currentColor" /> KEYBOARD RECORDING ARMED
            </>
          ) : (
            <>
              <Headphones size={12} /> A little better with headphones.
            </>
          )}
        </span>
        <span>
          <kbd>SPACE</kbd> play / pause <span className="status-divider">·</span>
          <kbd>A–K</kbd> play notes <span className="status-divider">·</span> MADE FOR MAKING
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "new" && (
        <Modal title="Where will you take it?" onClose={() => setModal(null)}>
          <p className="modal-subtitle">
            Start with a session, then make it yours. Your current session is saved to your library
            when you switch.
          </p>
          <div className="demo-picker">
            {demos.map((demo) => (
              <button
                type="button"
                key={demo.id}
                className="demo-card"
                style={{ "--demo-color": demo.color } as CSSProperties}
                onClick={() => load(demoSession(demo.id))}
              >
                <div className="demo-art">
                  <Disc3 size={60} />
                  <span>0{demo.id + 1}</span>
                </div>
                <strong>{demo.name}</strong>
                <small>{demo.genre}</small>
                <p>{demo.description}</p>
                <span className="open-demo">Open session ↗</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="blank-session"
            onClick={() => {
              const next = makeTrack(defaultPreset.id, 0);
              load({
                version: 1,
                name: "Untitled session",
                bpm: 120,
                bars: 16,
                swing: 0,
                master: 0.8,
                tracks: [next],
              });
              setPanel("Note editor");
            }}
          >
            <Plus size={18} />
            <span>
              Start from a blank canvas<small>Just you and your next idea.</small>
            </span>
          </button>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Your browser. Your studio." onClose={() => setModal(null)}>
          <p className="modal-subtitle">
            Start with the demo, or choose New session for a fresh idea.
          </p>
          <div className="help-grid">
            <section>
              <h3>01 / Make it yours</h3>
              <p>
                Press Space to play. Preview a sound with ▶, then click + to add it. Double-click a
                clip to open its note editor. Each clip edits independently. Drag clips between
                tracks, drag their edges to resize, and use ⌘/Ctrl C, V, D to copy, paste, or
                duplicate.
              </p>
            </section>
            <section>
              <h3>02 / Find your groove</h3>
              <p>
                Double-click to insert notes, or press B for draw mode. Drag empty space to select a
                group; Shift-click adds to the selection. Drag notes to move them, their right edges
                to resize, or Alt-drag to copy. Arrow keys move and transpose; Shift + ↑/↓ moves an
                octave. Delete erases the selection. Drag the loop brace or use ⌘/Ctrl L on a clip
                to loop it.
              </p>
            </section>
            <section>
              <h3>03 / Shape your sound</h3>
              <p>
                Open Devices to choose a preset and enable effects. Use the Mixer for levels, pan,
                mute, and solo. Play A W S E D F T G Y H U J K as a piano. Arm the record circle to
                capture notes while playing.
              </p>
            </section>
            <section>
              <h3>04 / Take it with you</h3>
              <p>
                Your work autosaves in this browser. Save adds a named copy to Sessions. Share
                creates a link anyone can remix. Export renders the complete arrangement as a stereo
                44.1 kHz, 16-bit WAV with effect tails.
              </p>
            </section>
          </div>
          <div className="shortcut-list">
            <span>
              <kbd>Space</kbd> Play / pause
            </span>
            <span>
              <kbd>Esc</kbd> Stop
            </span>
            <span>
              <kbd>⌘ / Ctrl Z</kbd> Undo
            </span>
            <span>
              <kbd>⌘ / Ctrl ⇧ Z</kbd> Redo
            </span>
            <span>
              <kbd>⌘ / Ctrl S</kbd> Save
            </span>
          </div>
          <p className="help-footnote">
            88 built-in sounds · 5 effects per track · Up to 24 tracks and 64 bars. All samples are
            original and MIT licensed. Desktop Chrome, Edge, Firefox, or Safari recommended. Audio
            runs locally; keep the studio tab open during playback.
          </p>
        </Modal>
      )}
      {modal === "share" && (
        <Modal title="Good music travels." onClose={() => setModal(null)}>
          <p className="modal-subtitle">
            This link contains a snapshot of your session. Anyone with it can play and remix their
            own copy.
          </p>
          <label className="share-url">
            SESSION LINK
            <input
              aria-label="Share URL"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            type="button"
            className="export-button copy-link"
            onClick={() => {
              void navigator.clipboard
                .writeText(shareUrl)
                .then(() => message("Session link copied."))
                .catch(() => message("Select the link above and copy it with ⌘/Ctrl C."));
            }}
          >
            <Copy size={16} /> Copy session link
          </button>
          <p className="help-footnote">
            Changes after sharing stay in your session. Create a new link to share the latest
            version. Bookmark the link to keep a portable backup.
          </p>
        </Modal>
      )}
    </main>
  );
}
