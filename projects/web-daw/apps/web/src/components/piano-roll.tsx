import { Copy, Expand, Minus, MousePointer2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { noteName } from "../lib/catalog";
import { moveNotes, noteKey, pasteNotes, replaceNotes, resizeNotes, snap } from "../lib/editing";
import type { Note, Track } from "../lib/session";

let noteClipboard: Note[] = [];
const pitches = Array.from({ length: 73 }, (_, index) => 96 - index);
const columns = Array.from({ length: 64 }, (_, index) => index);
type Gesture = {
  kind: "move" | "resize" | "select" | "draw" | "velocity";
  x: number;
  y: number;
  step: number;
  pitch: number;
  notes: Note[];
  additive: boolean;
  copy: boolean;
};
export function PianoRoll({
  track,
  position,
  onChange,
  onPreview,
}: {
  track: Track;
  position: number;
  onChange: (track: Track) => void;
  onPreview: (pitch: number) => void;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [grid, setGrid] = useState(1);
  const [draw, setDraw] = useState(false);
  const [duration, setDuration] = useState(1);
  const [velocity, setVelocity] = useState(0.8);
  const [cursor, setCursor] = useState(0);
  const [zoom, setZoom] = useState(0.75);
  const [preview, setPreview] = useState<Note[] | null>(null);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const velocityCanvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const selectedNotes = track.notes.filter((note) => selection.has(noteKey(note)));
  const initialPitch = useRef(Math.max(60, ...track.notes.map((note) => note.pitch)));
  const rowHeight = 14;
  const minWidth = Math.max(520, track.length * 19) * zoom;
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = Math.max(0, (96 - initialPitch.current - 4) * rowHeight);
    }
  }, []);
  function commit(notes: Note[], originals = selectedNotes, copy = false) {
    onChange(replaceNotes(track, copy ? [] : originals, notes));
    setSelection(new Set(notes.map(noteKey)));
    setPreview(null);
  }
  function erase() {
    onChange(replaceNotes(track, selectedNotes, []));
    setSelection(new Set());
  }
  function duplicate() {
    if (!selectedNotes.length) {
      return;
    }
    const end =
      Math.ceil(Math.max(...selectedNotes.map((note) => note.step + note.duration)) / grid) * grid;
    const result = pasteNotes(track, selectedNotes, end);
    onChange(result.track);
    setSelection(new Set(result.pasted.map(noteKey)));
    setCursor(end);
    if (!result.pasted.length) {
      setFeedback("The pattern is full. Move the selection earlier before duplicating.");
    }
  }
  function paste() {
    const result = pasteNotes(track, noteClipboard, cursor);
    onChange(result.track);
    setSelection(new Set(result.pasted.map(noteKey)));
  }
  function coordinates(event: { clientX: number; clientY: number }) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) {
      return { step: 0, pitch: 60, x: 0, y: 0 };
    }
    return {
      step: Math.max(
        0,
        Math.min(
          track.length - grid,
          Math.floor((((event.clientX - rect.left) / rect.width) * track.length) / grid) * grid,
        ),
      ),
      pitch: Math.max(24, Math.min(96, 96 - Math.floor((event.clientY - rect.top) / rowHeight))),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }
  function add(step: number, pitch: number) {
    const note = { step, pitch, duration: Math.min(duration, track.length - step), velocity };
    onChange(replaceNotes(track, [], [note]));
    setSelection(new Set([noteKey(note)]));
    setCursor(step);
    onPreview(pitch);
  }
  function startNote(event: PointerEvent<HTMLButtonElement>, note: Note, resize = false) {
    event.stopPropagation();
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    root.current?.focus({ preventScroll: true });
    if (draw && !resize) {
      onChange(replaceNotes(track, [note], []));
      return;
    }
    const already = selection.has(noteKey(note));
    if (event.shiftKey && !resize) {
      const next = new Set(selection);
      if (already) {
        next.delete(noteKey(note));
      } else {
        next.add(noteKey(note));
      }
      setSelection(next);
      return;
    }
    const notes = already ? selectedNotes : [note];
    setSelection(new Set(notes.map(noteKey)));
    setVelocity(note.velocity);
    setDuration(note.duration);
    setCursor(note.step);
    gesture.current = {
      kind: resize ? "resize" : "move",
      x: event.clientX,
      y: event.clientY,
      step: note.step,
      pitch: note.pitch,
      notes,
      additive: false,
      copy: event.altKey,
    };
    canvas.current?.setPointerCapture(event.pointerId);
    onPreview(note.pitch);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    const rect = canvas.current?.getBoundingClientRect();
    if (!active || !rect) {
      return;
    }
    if (active.kind === "select") {
      const point = coordinates(event);
      const left = Math.min(active.x - rect.left, point.x);
      const top = Math.min(active.y - rect.top, point.y);
      const width = Math.abs(event.clientX - active.x);
      const height = Math.abs(event.clientY - active.y);
      setMarquee({ left, top, width, height });
      const selected = track.notes.filter((note) => {
        const x = (note.step / track.length) * rect.width;
        const y = (96 - note.pitch) * rowHeight;
        return (
          x + (note.duration / track.length) * rect.width >= left &&
          x <= left + width &&
          y + rowHeight >= top &&
          y <= top + height
        );
      });
      setSelection(new Set([...(active.additive ? active.notes : []), ...selected].map(noteKey)));
      return;
    }
    if (active.kind === "draw") {
      const point = coordinates(event);
      const note = active.notes[0];
      if (note) {
        setPreview([
          {
            ...note,
            duration: Math.max(
              grid,
              Math.min(track.length - note.step, point.step - note.step + grid),
            ),
          },
        ]);
      }
      return;
    }
    if (active.kind === "velocity") {
      const value = Math.max(0.05, Math.min(1, 1 - (event.clientY - active.y) / 60));
      setPreview(active.notes.map((note) => ({ ...note, velocity: value })));
      return;
    }
    const dx = snap(((event.clientX - active.x) / rect.width) * track.length, grid);
    const dy = -Math.round((event.clientY - active.y) / rowHeight);
    setPreview(
      active.kind === "resize"
        ? resizeNotes(active.notes, dx, track.length, grid)
        : moveNotes(active.notes, dx, dy, track.length),
    );
  }
  function finish() {
    const active = gesture.current;
    if (!active) {
      return;
    }
    if (preview) {
      commit(preview, active.kind === "draw" ? [] : active.notes, active.copy);
    } else if (active.kind === "draw") {
      commit(active.notes, []);
    }
    gesture.current = null;
    setPreview(null);
    setMarquee(null);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).matches("input,select,textarea")) {
      return;
    }
    const key = event.key.toLowerCase();
    const modifier = event.metaKey || event.ctrlKey;
    let handled = true;
    if (modifier && key === "a") {
      setSelection(new Set(track.notes.map(noteKey)));
    } else if (modifier && key === "c") {
      noteClipboard = structuredClone(selectedNotes);
      setFeedback(`${selectedNotes.length} notes copied`);
    } else if (modifier && key === "x") {
      noteClipboard = structuredClone(selectedNotes);
      erase();
    } else if (modifier && key === "v") {
      paste();
    } else if (modifier && key === "d") {
      duplicate();
    } else if (key === "delete" || key === "backspace") {
      erase();
    } else if (!modifier && key === "b") {
      setDraw(!draw);
    } else if (key === "escape") {
      setSelection(new Set());
    } else if (key === "arrowup" || key === "arrowdown") {
      const moved = moveNotes(
        selectedNotes,
        0,
        (key === "arrowup" ? 1 : -1) * (event.shiftKey ? 12 : 1),
        track.length,
      );
      commit(moved);
      const container = scroll.current;
      if (container && moved.length) {
        const top = (96 - Math.max(...moved.map((note) => note.pitch))) * rowHeight;
        const bottom = (97 - Math.min(...moved.map((note) => note.pitch))) * rowHeight + 24;
        if (top < container.scrollTop) {
          container.scrollTop = Math.max(0, top - rowHeight * 2);
        } else if (bottom > container.scrollTop + container.clientHeight) {
          container.scrollTop = bottom - container.clientHeight + rowHeight * 2;
        }
      }
    } else if (key === "arrowleft" || key === "arrowright") {
      const delta = (key === "arrowright" ? 1 : -1) * grid;
      if (event.shiftKey) {
        commit(resizeNotes(selectedNotes, delta, track.length, grid));
      } else if (selectedNotes.length) {
        commit(moveNotes(selectedNotes, delta, 0, track.length));
      } else {
        setCursor(Math.max(0, Math.min(track.length - grid, cursor + delta)));
      }
    } else if (key === "enter") {
      add(cursor, 60);
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  const visibleNotes = [
    ...new Map(
      (preview && gesture.current
        ? [
            ...track.notes.filter(
              (note) =>
                gesture.current?.copy ||
                !gesture.current?.notes.some((original) => noteKey(original) === noteKey(note)),
            ),
            ...preview,
          ]
        : track.notes
      ).map((note) => [noteKey(note), note]),
    ).values(),
  ];
  return (
    <div
      className="producer-editor"
      ref={root}
      role="application"
      aria-label="Piano roll. Select, draw, move, and resize MIDI notes"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The MIDI editing surface handles selection and note editing through the keyboard.
      tabIndex={0}
      onKeyDown={keyboard}
    >
      <div className="producer-toolbar">
        <strong style={{ color: track.color }}>{track.name}</strong>
        <div className="edit-tools">
          <button
            type="button"
            aria-label="Select notes"
            aria-pressed={!draw}
            className={!draw ? "active" : ""}
            onClick={() => setDraw(false)}
          >
            <MousePointer2 size={14} />
          </button>
          <button
            type="button"
            aria-label="Draw notes (B)"
            aria-pressed={draw}
            className={draw ? "active" : ""}
            onClick={() => setDraw(true)}
          >
            <Pencil size={14} />
          </button>
        </div>
        <label>
          Grid
          <select
            aria-label="Piano grid"
            value={grid}
            onChange={(event) => setGrid(Number(event.target.value))}
          >
            {[4, 2, 1, 0.5].map((value) => (
              <option value={value} key={value}>
                1/{16 / value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Length
          <select
            aria-label="Pattern length"
            value={track.length}
            onChange={(event) => {
              const length = Number(event.target.value) as Track["length"];
              onChange({
                ...track,
                length,
                notes: track.notes
                  .filter((note) => note.step < length)
                  .map((note) => ({
                    ...note,
                    duration: Math.min(note.duration, length - note.step),
                  })),
              });
            }}
          >
            {[16, 32, 64].map((value) => (
              <option key={value} value={value}>
                {value / 16} bars
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <select
            aria-label="Note length"
            value={duration}
            onChange={(event) => {
              const value = Number(event.target.value);
              setDuration(value);
              if (selectedNotes.length) {
                commit(
                  selectedNotes.map((note) => ({
                    ...note,
                    duration: Math.min(value, track.length - note.step),
                  })),
                );
              }
            }}
          >
            {[0.5, 1, 2, 4, 8, 16, 32, 64].map((value) => (
              <option key={value} value={value}>
                {value >= 16 ? `${value / 16} bar` : `1/${16 / value}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Duplicate notes"
          disabled={!selectedNotes.length}
          onClick={duplicate}
        >
          <Copy size={13} />
          <span>Duplicate</span>
        </button>
        <button
          type="button"
          aria-label="Delete notes"
          disabled={!selectedNotes.length}
          onClick={erase}
        >
          <Trash2 size={13} />
        </button>
        <span className="toolbar-spacer" />
        <button
          type="button"
          aria-label="Zoom piano out"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          aria-label="Zoom piano in"
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <Plus size={13} />
        </button>
        <button type="button" aria-label="Fit piano roll" onClick={() => setZoom(0.5)}>
          <Expand size={13} />
        </button>
      </div>
      <div
        className="producer-piano-scroll"
        ref={scroll}
        onScroll={(event) => {
          if (velocityCanvas.current) {
            velocityCanvas.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      >
        <div className="producer-piano" style={{ minWidth: minWidth + 52 }}>
          <div className="producer-ruler">
            <div className="piano-corner">NOTES</div>
            <div className="piano-beats">
              {columns
                .slice(0, track.length)
                .filter((step) => step % 4 === 0)
                .map((step) => (
                  <button
                    type="button"
                    key={step}
                    style={{ left: `${(step / track.length) * 100}%` }}
                    onClick={() => {
                      setCursor(step);
                      setSelection(new Set());
                      root.current?.focus({ preventScroll: true });
                    }}
                  >
                    {Math.floor(step / 16) + 1}.{(step % 16) / 4 + 1}
                  </button>
                ))}
            </div>
          </div>
          <div className="producer-pitches">
            <div className="producer-keys">
              {pitches.map((pitch) => (
                <button
                  type="button"
                  key={pitch}
                  className={noteName(pitch).includes("♯") ? "black" : ""}
                  onClick={() => onPreview(pitch)}
                >
                  {pitch % 12 === 0 ? noteName(pitch) : ""}
                </button>
              ))}
            </div>
            <div
              role="application"
              aria-label="Note grid"
              ref={canvas}
              className={`producer-canvas ${draw ? "drawing" : ""}`}
              style={
                {
                  "--track-color": track.color,
                  "--step-width": `${(100 * grid) / track.length}%`,
                  "--beat-width": `${400 / track.length}%`,
                } as CSSProperties
              }
              onPointerDown={(event) => {
                if (event.button !== 0 || (event.target as HTMLElement).closest("button")) {
                  return;
                }
                event.preventDefault();
                root.current?.focus({ preventScroll: true });
                const point = coordinates(event);
                setCursor(point.step);
                const note = {
                  step: point.step,
                  pitch: point.pitch,
                  duration: Math.min(duration, track.length - point.step),
                  velocity,
                };
                gesture.current = {
                  kind: draw ? "draw" : "select",
                  x: event.clientX,
                  y: event.clientY,
                  step: point.step,
                  pitch: point.pitch,
                  notes: draw ? [note] : selectedNotes,
                  copy: false,
                  additive: event.shiftKey,
                };
                if (draw) {
                  setPreview([note]);
                  onPreview(point.pitch);
                } else if (!event.shiftKey) {
                  setSelection(new Set());
                }
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={() => {
                gesture.current = null;
                setPreview(null);
                setMarquee(null);
              }}
              onDoubleClick={(event) => {
                if ((event.target as HTMLElement).closest("button")) {
                  return;
                }
                const point = coordinates(event);
                add(point.step, point.pitch);
              }}
            >
              {pitches.map((pitch) => (
                <div
                  key={pitch}
                  className={`producer-note-row ${noteName(pitch).includes("♯") ? "black" : ""} ${pitch % 12 === 0 ? "octave" : ""}`}
                />
              ))}
              {visibleNotes.map((note) => (
                <button
                  type="button"
                  key={noteKey(note)}
                  aria-label={`${noteName(note.pitch)} at step ${note.step + 1}`}
                  className={`producer-note ${selection.has(noteKey(note)) ? "selected" : ""}`}
                  style={{
                    left: `${(note.step / track.length) * 100}%`,
                    width: `${(note.duration / track.length) * 100}%`,
                    top: (96 - note.pitch) * rowHeight,
                    opacity: 0.45 + note.velocity * 0.55,
                  }}
                  onPointerDown={(event) => startNote(event, note)}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onChange(replaceNotes(track, [note], []));
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onChange(replaceNotes(track, [note], []));
                  }}
                >
                  <span>{noteName(note.pitch)}</span>
                  <span
                    className="note-resize-handle"
                    role="presentation"
                    title="Drag to resize. Shift + arrow keys resize selected notes."
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      root.current?.focus({ preventScroll: true });
                      const notes = selection.has(noteKey(note)) ? selectedNotes : [note];
                      setSelection(new Set(notes.map(noteKey)));
                      gesture.current = {
                        kind: "resize",
                        x: event.clientX,
                        y: event.clientY,
                        step: note.step,
                        pitch: note.pitch,
                        notes,
                        additive: false,
                        copy: false,
                      };
                      canvas.current?.setPointerCapture(event.pointerId);
                    }}
                  />
                </button>
              ))}
              <div
                className="producer-cursor"
                style={{ left: `${(cursor / track.length) * 100}%` }}
              />
              {position >= 0 && (
                <div
                  className="producer-playhead"
                  style={{ left: `${((position % track.length) / track.length) * 100}%` }}
                />
              )}
              {marquee && <div className="selection-marquee" style={marquee} />}
            </div>
          </div>
        </div>
      </div>
      <div className="velocity-scroll" ref={velocityCanvas}>
        <div className="velocity-content" style={{ minWidth: minWidth + 52 }}>
          <span className="velocity-label">VELOCITY</span>
          <div className="velocity-grid" style={{ "--track-color": track.color } as CSSProperties}>
            {visibleNotes.map((note) => (
              <button
                type="button"
                key={noteKey(note)}
                aria-label={`Velocity for ${noteName(note.pitch)} at step ${note.step + 1}`}
                className={selection.has(noteKey(note)) ? "selected" : ""}
                style={{
                  left: `${(note.step / track.length) * 100}%`,
                  height: `${note.velocity * 100}%`,
                }}
                onPointerDown={(event) => {
                  const notes = selection.has(noteKey(note)) ? selectedNotes : [note];
                  setSelection(new Set(notes.map(noteKey)));
                  gesture.current = {
                    kind: "velocity",
                    x: event.clientX,
                    y: event.clientY - (1 - note.velocity) * 60,
                    step: note.step,
                    pitch: note.pitch,
                    notes,
                    copy: false,
                    additive: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={move}
                onPointerUp={finish}
              >
                <i />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="producer-editor-footer">
        <span>
          {feedback ||
            `${selectedNotes.length} selected · ${draw ? "Draw mode · Drag to draw notes" : "Double-click to insert · Drag to select · Alt-drag to copy"}`}
        </span>
        <label>
          Velocity{" "}
          <input
            aria-label="Note velocity"
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={selectedNotes[0]?.velocity ?? velocity}
            onChange={(event) => {
              const value = Number(event.target.value);
              setVelocity(value);
              if (selectedNotes.length) {
                commit(selectedNotes.map((note) => ({ ...note, velocity: value })));
              }
            }}
          />
          <output>{Math.round((selectedNotes[0]?.velocity ?? velocity) * 127)}</output>
        </label>
        <span>
          <kbd>B</kbd> Draw · <kbd>⌘/Ctrl D</kbd> Duplicate · <kbd>↑↓</kbd> Transpose
        </span>
      </div>
    </div>
  );
}
