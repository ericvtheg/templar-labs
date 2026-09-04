import {
  Activity,
  ChevronRight,
  Disc3,
  Headphones,
  Music2,
  Play,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import {
  type EffectId,
  effects,
  noteName,
  presets,
  type Sound,
  samples,
  soundById,
} from "../lib/catalog";
import { demos, type Note, type Session, type Track } from "../lib/session";

const positions = (length: number) => Array.from({ length }, (_, position) => position);
export function Range({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  format?: string | undefined;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <output>{format ?? `${Math.round(value * 100)}%`}</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
export function Browser({
  onPreview,
  onAdd,
  onEffect,
  onDemo,
  saved,
  onLoad,
}: {
  onPreview: (sound: Sound) => void;
  onAdd: (sound: Sound) => void;
  onEffect: (id: EffectId) => void;
  onDemo: (id: number) => void;
  saved: Session[];
  onLoad: (session: Session) => void;
}) {
  const [tab, setTab] = useState("Sounds");
  const [category, setCategory] = useState("All sounds");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState("");
  const categories = ["All sounds", "Drums", "Bass", "Keys", "Pad", "Pluck", "Analog", "Fm"];
  const filtered = [...presets, ...samples].filter(
    (sound) =>
      (category === "All sounds" ||
        (category === "Drums" ? sound.kind === "sample" : sound.family === category)) &&
      `${sound.name} ${sound.family}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <aside className="browser">
      <div className="browser-heading">
        <span>YOUR SOUND, STARTS HERE</span>
        <Headphones size={14} />
      </div>
      <div className="browser-tabs">
        {["Sounds", "Effects", "Sessions"].map((name) => (
          <button
            key={name}
            type="button"
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab !== "Sessions" && (
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Search library"
            placeholder={tab === "Sounds" ? "Find your next sound…" : "Find an effect…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
      )}
      {tab === "Sounds" && (
        <>
          <div className="categories">
            {categories.map((name, i) => (
              <button
                type="button"
                className={category === name ? "selected" : ""}
                key={name}
                onClick={() => setCategory(name)}
              >
                <span>
                  {i === 0 ? (
                    <Sparkles size={14} />
                  ) : i === 1 ? (
                    <Disc3 size={14} />
                  ) : (
                    <Music2 size={14} />
                  )}{" "}
                  {name === "Fm" ? "FM" : name}
                </span>
                <small>{name === "All sounds" ? 88 : name === "Drums" ? 64 : 4}</small>
              </button>
            ))}
          </div>
          <div className="library-label">
            <span>{category.toUpperCase()}</span>
            <span>{filtered.length}</span>
          </div>
          <div className="sound-list">
            {filtered.map((sound) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: Drag is a shortcut; the Add button provides keyboard access.
              <div
                className={`sound-row ${preview === sound.id ? "previewing" : ""}`}
                key={sound.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/sound", sound.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                <button
                  type="button"
                  className="preview-button"
                  aria-label={`Preview ${sound.name}`}
                  onClick={() => {
                    setPreview(sound.id);
                    onPreview(sound);
                  }}
                >
                  <Play size={12} />
                </button>
                <button
                  type="button"
                  className="sound-name"
                  onClick={() => onAdd(sound)}
                  title={`Add ${sound.name} as a new track`}
                >
                  <span>{sound.name}</span>
                  <small>{sound.kind === "sample" ? "ONE-SHOT" : sound.family.toUpperCase()}</small>
                </button>
                <button
                  type="button"
                  className="sound-add"
                  aria-label={`Add ${sound.name}`}
                  onClick={() => onAdd(sound)}
                >
                  <Plus size={13} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && <p className="empty">No sounds found. Try another search.</p>}
          </div>
        </>
      )}
      {tab === "Effects" && (
        <div className="effect-library">
          <p className="subtle">Add to the selected track</p>
          {effects
            .filter((fx) => `${fx.name} ${fx.category}`.toLowerCase().includes(query.toLowerCase()))
            .map((fx) => (
              <button key={fx.id} type="button" onClick={() => onEffect(fx.id)}>
                <span className="effect-icon" style={{ color: fx.color }}>
                  <SlidersHorizontal size={19} />
                </span>
                <span>
                  <strong>{fx.name}</strong>
                  <small>{fx.description}</small>
                </span>
                <Plus size={14} />
              </button>
            ))}
        </div>
      )}
      {tab === "Sessions" && (
        <div className="session-library">
          <p className="library-label">START WITH A LITTLE INSPIRATION</p>
          {demos.map((demo) => (
            <button
              className="demo-card"
              key={demo.id}
              type="button"
              onClick={() => onDemo(demo.id)}
              style={{ "--demo-color": demo.color } as CSSProperties}
            >
              <div className="demo-art">
                <Disc3 size={44} />
                <span>0{demo.id + 1}</span>
              </div>
              <strong>
                {demo.name}
                <ChevronRight size={15} />
              </strong>
              <small>{demo.genre}</small>
              <p>{demo.description}</p>
            </button>
          ))}
          {saved.length > 0 && (
            <>
              <p className="library-label">YOUR SAVED SESSIONS</p>
              {saved.map((session) => (
                <button
                  type="button"
                  className="saved-session"
                  key={session.name}
                  onClick={() => onLoad(session)}
                >
                  <Music2 size={16} />
                  <span>
                    {session.name}
                    <small>
                      {session.bpm} BPM · {session.tracks.length} tracks
                    </small>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div className="library-footer">
        <span className="green-dot" />
        <span>
          24 instruments · 64 samples
          <br />
          <small>All included. All yours to use.</small>
        </span>
      </div>
    </aside>
  );
}
export function Devices({
  track,
  onChange,
  onPreview,
}: {
  track: Track;
  onChange: (track: Track) => void;
  onPreview: () => void;
}) {
  const sound = soundById(track.sound);
  return (
    <div className="device-rack">
      <section
        className="device instrument-device"
        style={{ "--device-color": track.color } as CSSProperties}
      >
        <div className="device-title">
          <span>
            <Music2 size={14} />
            {sound.kind === "sample" ? "SAMPLER" : "INSTRUMENT"}
          </span>
          <span className="green-dot" />
        </div>
        <h3>{sound.name}</h3>
        <div className="oscillator" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 240 40">
            <path
              d={
                sound.kind === "sample"
                  ? Array.from(
                      { length: 80 },
                      (_, i) =>
                        `${i === 0 ? "M" : "L"}${i * 3},${20 + Math.sin(i * 2.3) * Math.exp(-i / 25) * 19}`,
                    ).join(" ")
                  : Array.from(
                      { length: 120 },
                      (_, i) => `${i === 0 ? "M" : "L"}${i * 2},${20 + Math.sin(i * 0.17) * 15}`,
                    ).join(" ")
              }
            />
          </svg>
        </div>
        <select
          aria-label="Track sound"
          value={track.sound}
          onChange={(e) => onChange({ ...track, sound: e.target.value })}
        >
          {(sound.kind === "sample" ? samples : presets).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button type="button" className="audition" onClick={onPreview}>
          <Play size={12} /> Audition <kbd>A–K</kbd>
        </button>
      </section>
      {effects.map((fx) => (
        <section
          key={fx.id}
          className={`device ${track.effects[fx.id].enabled ? "enabled" : "bypassed"}`}
          style={{ "--device-color": fx.color } as CSSProperties}
        >
          <div className="device-title">
            <span>{fx.category.toUpperCase()}</span>
            <button
              type="button"
              aria-label={`${track.effects[fx.id].enabled ? "Bypass" : "Enable"} ${fx.name}`}
              aria-pressed={track.effects[fx.id].enabled}
              onClick={() =>
                onChange({
                  ...track,
                  effects: {
                    ...track.effects,
                    [fx.id]: { ...track.effects[fx.id], enabled: !track.effects[fx.id].enabled },
                  },
                })
              }
            >
              <Power size={13} />
            </button>
          </div>
          <h3>{fx.name}</h3>
          <div className={`device-visual visual-${fx.id}`} aria-hidden="true">
            {fx.id === "filter" ? (
              <svg aria-hidden="true" viewBox="0 0 100 40">
                <path
                  d={`M0 8 H${15 + track.effects.filter.value * 45} Q${45 + track.effects.filter.value * 45} 8 ${55 + track.effects.filter.value * 40} 36 H100`}
                />
              </svg>
            ) : fx.id === "drive" ? (
              <svg aria-hidden="true" viewBox="0 0 100 40">
                <path d="M0 34 Q25 34 40 20 T100 6" />
              </svg>
            ) : (
              positions(fx.id === "delay" ? 6 : 18).map((i) => (
                <i
                  key={`position-${i}`}
                  style={{
                    height: `${12 + Math.sin(i * 1.5) * 10 + ((18 - i) / 18) * 16}px`,
                    opacity: 1 - i / 22,
                  }}
                />
              ))
            )}
          </div>
          <Range
            label={
              fx.id === "filter"
                ? "Cutoff"
                : fx.id === "drive"
                  ? "Drive"
                  : fx.id === "compressor"
                    ? "Amount"
                    : "Mix"
            }
            value={track.effects[fx.id].value}
            format={
              fx.id === "filter"
                ? `${((120 * 160 ** track.effects.filter.value) / 1000).toFixed(1)} kHz`
                : undefined
            }
            onChange={(value) =>
              onChange({
                ...track,
                effects: { ...track.effects, [fx.id]: { ...track.effects[fx.id], value } },
              })
            }
          />
          <small className="device-status">
            {track.effects[fx.id].enabled
              ? fx.id === "delay"
                ? "Dotted 1/8 · tempo sync"
                : "ACTIVE"
              : "BYPASSED"}
          </small>
        </section>
      ))}
    </div>
  );
}
export function NoteEditor({
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
  const [page, setPage] = useState(0);
  const [duration, setDuration] = useState(2);
  const [velocity, setVelocity] = useState(0.8);
  const [selected, setSelected] = useState<Note | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const drum = soundById(track.sound).kind === "sample";
  const pageStart = Math.min(page, Math.ceil(track.length / 16) - 1) * 16;
  const pitches = Array.from({ length: 25 }, (_, i) => 72 - i);
  const bass = soundById(track.sound).family === "Bass";
  const shifted = pitches.map((p) => (bass ? p - 24 : p));
  const remove = (note: Note) => {
    onChange({ ...track, notes: track.notes.filter((n) => n !== note) });
    setSelected(null);
  };
  const add = (step: number, pitch: number) => {
    const note = { step, pitch, duration: Math.min(duration, track.length - step), velocity };
    onChange({
      ...track,
      notes: [...track.notes.filter((n) => n.step !== step || n.pitch !== pitch), note],
    });
    setSelected(note);
    onPreview(pitch);
  };
  return (
    <div className="note-editor">
      <div className="editor-toolbar">
        <span className="editor-track" style={{ color: track.color }}>
          <Music2 size={14} />
          {track.name}
        </span>
        <label>
          Pattern{" "}
          <select
            aria-label="Pattern length"
            value={track.length}
            onChange={(e) => {
              const length = Number(e.target.value) as Track["length"];
              onChange({
                ...track,
                length,
                notes: track.notes
                  .filter((n) => n.step < length)
                  .map((note) => ({
                    ...note,
                    duration: Math.min(note.duration, length - note.step),
                  })),
              });
              setPage(0);
            }}
          >
            <option value={16}>1 bar</option>
            <option value={32}>2 bars</option>
            <option value={64}>4 bars</option>
          </select>
        </label>
        <div className="page-buttons">
          {positions(track.length / 16).map((i) => (
            <button
              type="button"
              key={`position-${i}`}
              className={pageStart === i * 16 ? "active" : ""}
              onClick={() => setPage(i)}
            >
              Bar {i + 1}
            </button>
          ))}
        </div>
        <label>
          Length{" "}
          <select
            aria-label="Note length"
            value={duration}
            onChange={(e) => {
              const value = Number(e.target.value);
              setDuration(value);
              if (selected) {
                onChange({
                  ...track,
                  notes: track.notes.map((n) =>
                    n === selected ? { ...n, duration: Math.min(value, track.length - n.step) } : n,
                  ),
                });
                setSelected(null);
              }
            }}
          >
            {[1, 2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>
                {n === 16 ? "1 bar" : `1/${16 / n}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Velocity{" "}
          <input
            aria-label="Note velocity"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={velocity}
            onChange={(e) => {
              const value = Number(e.target.value);
              setVelocity(value);
              if (selected) {
                const updated = { ...selected, velocity: value };
                onChange({
                  ...track,
                  notes: track.notes.map((n) => (n === selected ? updated : n)),
                });
                setSelected(updated);
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (selected) {
              remove(selected);
            }
          }}
        >
          Delete note
        </button>
      </div>
      {drum ? (
        <div className="drum-editor">
          <div className="drum-name">
            <Disc3 size={26} />
            <strong>{soundById(track.sound).name}</strong>
            <small>16-step sequencer</small>
          </div>
          <div className="steps">
            {positions(16).map((i) => {
              const note = track.notes.find((n) => n.step === pageStart + i);
              return (
                <button
                  type="button"
                  key={`position-${i}`}
                  aria-label={`Step ${pageStart + i + 1}`}
                  aria-pressed={Boolean(note)}
                  className={`${note ? "on" : ""} ${Math.floor(position) % track.length === pageStart + i ? "current" : ""}`}
                  style={{ "--track-color": track.color } as CSSProperties}
                  onClick={() => (note ? remove(note) : add(pageStart + i, 60))}
                >
                  <span>{i + 1}</span>
                  <i />
                  <small>{note ? Math.round(note.velocity * 100) : "—"}</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="piano-scroll">
          <div className="piano">
            <div className="piano-labels">
              {shifted.map((pitch) => (
                <button
                  key={pitch}
                  type="button"
                  className={noteName(pitch).includes("♯") ? "black" : ""}
                  onClick={() => onPreview(pitch)}
                >
                  {noteName(pitch)}
                </button>
              ))}
            </div>
            <div
              className="piano-grid"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("application/note");
                if (!raw) {
                  return;
                }
                const original = JSON.parse(raw) as { step: number; pitch: number };
                const box = e.currentTarget.getBoundingClientRect();
                const step =
                  pageStart +
                  Math.max(0, Math.min(15, Math.floor(((e.clientX - box.left) / box.width) * 16)));
                const pitch =
                  shifted[
                    Math.max(0, Math.min(24, Math.floor(((e.clientY - box.top) / box.height) * 25)))
                  ] ?? 60;
                onChange({
                  ...track,
                  notes: track.notes
                    .filter(
                      (n) =>
                        !(n.step === step && n.pitch === pitch) ||
                        (n.step === original.step && n.pitch === original.pitch),
                    )
                    .map((n) =>
                      n.step === original.step && n.pitch === original.pitch
                        ? {
                            ...n,
                            step,
                            pitch,
                            duration: Math.min(n.duration, track.length - step),
                          }
                        : n,
                    ),
                });
              }}
              role="application"
              aria-label="Piano roll. Click to add notes"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: The piano roll handles Enter and Delete for keyboard note editing.
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "Delete" || e.key === "Backspace") && selected) {
                  e.preventDefault();
                  remove(selected);
                }
                if (e.key === "Enter") {
                  add(pageStart, 60);
                }
              }}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const step =
                  Math.min(15, Math.floor(((e.clientX - box.left) / box.width) * 16)) + pageStart;
                const pitch =
                  shifted[
                    Math.max(0, Math.min(24, Math.floor(((e.clientY - box.top) / box.height) * 25)))
                  ] ?? 60;
                add(step, pitch);
              }}
              style={{ "--track-color": track.color } as CSSProperties}
            >
              {shifted.map((pitch) => (
                <div
                  key={pitch}
                  className={`piano-row ${noteName(pitch).includes("♯") ? "accidental" : ""} ${pitch % 12 === 0 ? "octave" : ""}`}
                />
              ))}
              {track.notes
                .filter(
                  (n) =>
                    n.step >= pageStart && n.step < pageStart + 16 && shifted.includes(n.pitch),
                )
                .map((note) => (
                  <button
                    type="button"
                    key={`${note.step}-${note.pitch}`}
                    aria-label={`${noteName(note.pitch)} at step ${note.step + 1}`}
                    title="Drag to move · Double-click to delete"
                    onPointerDown={(event) => {
                      drag.current = { x: event.clientX, y: event.clientY };
                      didDrag.current = false;
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (!drag.current) {
                        return;
                      }
                      event.currentTarget.style.translate = `${event.clientX - drag.current.x}px ${event.clientY - drag.current.y}px`;
                    }}
                    onPointerCancel={(event) => {
                      drag.current = null;
                      event.currentTarget.style.translate = "";
                    }}
                    onPointerUp={(event) => {
                      const start = drag.current;
                      drag.current = null;
                      event.currentTarget.style.translate = "";
                      const box = event.currentTarget.parentElement?.getBoundingClientRect();
                      if (
                        !start ||
                        !box ||
                        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4
                      ) {
                        return;
                      }
                      didDrag.current = true;
                      const step = Math.max(
                        pageStart,
                        Math.min(
                          pageStart + 15,
                          note.step + Math.round(((event.clientX - start.x) / box.width) * 16),
                        ),
                      );
                      const pitch = Math.max(
                        bass ? 24 : 48,
                        Math.min(
                          bass ? 48 : 72,
                          note.pitch - Math.round(((event.clientY - start.y) / box.height) * 25),
                        ),
                      );
                      const moved = {
                        ...note,
                        step,
                        pitch,
                        duration: Math.min(note.duration, track.length - step),
                      };
                      onChange({
                        ...track,
                        notes: [
                          ...track.notes.filter(
                            (item) =>
                              item !== note && !(item.step === step && item.pitch === pitch),
                          ),
                          moved,
                        ],
                      });
                      setSelected(moved);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (didDrag.current) {
                        didDrag.current = false;
                        return;
                      }
                      setSelected(note);
                      setVelocity(note.velocity);
                      setDuration(note.duration);
                      onPreview(note.pitch);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      remove(note);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      remove(note);
                    }}
                    className={`midi-note ${selected === note ? "selected" : ""}`}
                    style={{
                      left: `${((note.step - pageStart) / 16) * 100}%`,
                      top: `${shifted.indexOf(note.pitch) * 4}%`,
                      width: `${(Math.min(note.duration, pageStart + 16 - note.step) / 16) * 100}%`,
                      opacity: 0.5 + note.velocity * 0.5,
                    }}
                  >
                    {noteName(note.pitch)}
                  </button>
                ))}

              {Math.floor(position) % track.length >= pageStart &&
                Math.floor(position) % track.length < pageStart + 16 && (
                  <div
                    className="editor-playhead"
                    style={{ left: `${(((position % track.length) - pageStart) / 16) * 100}%` }}
                  />
                )}
            </div>
          </div>
        </div>
      )}
      <div className="editor-hint">
        <span>
          {drum
            ? "Click steps to build your groove."
            : "Click to draw · Drag to move · Double-click to erase · Select a note to change length or velocity"}
        </span>
        <span>1/16 GRID · {track.notes.length} NOTES</span>
      </div>
    </div>
  );
}
export function Mixer({
  session,
  meters,
  onChange,
  onSelect,
}: {
  session: Session;
  meters: Record<string, number> & { master?: number };
  onChange: (session: Session) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mixer">
      {session.tracks.map((track, i) => (
        <section
          className="mixer-channel"
          key={track.id}
          style={{ "--track-color": track.color } as CSSProperties}
        >
          <button className="channel-name" type="button" onClick={() => onSelect(track.id)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {track.name}
          </button>
          <div className="channel-fader">
            <input
              aria-label={`${track.name} volume`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={track.volume}
              onChange={(e) =>
                onChange({
                  ...session,
                  tracks: session.tracks.map((t) =>
                    t.id === track.id ? { ...t, volume: Number(e.target.value) } : t,
                  ),
                })
              }
            />
            <div className="vertical-meter">
              <i style={{ height: `${Math.min(100, (meters[track.id] ?? 0) * 300)}%` }} />
            </div>
            <span>
              {track.volume === 0 ? "−∞" : (20 * Math.log10(track.volume)).toFixed(1)}
              <small>dB</small>
            </span>
          </div>
          <Range
            label={`${track.name} pan`}
            value={track.pan}
            min={-1}
            max={1}
            format={
              track.pan === 0
                ? "C"
                : `${Math.round(Math.abs(track.pan) * 100)}${track.pan < 0 ? "L" : "R"}`
            }
            onChange={(pan) =>
              onChange({
                ...session,
                tracks: session.tracks.map((t) => (t.id === track.id ? { ...t, pan } : t)),
              })
            }
          />
          <div className="channel-buttons">
            <button
              type="button"
              className={track.muted ? "muted" : ""}
              aria-pressed={track.muted}
              aria-label={`Mute ${track.name}`}
              onClick={() =>
                onChange({
                  ...session,
                  tracks: session.tracks.map((t) =>
                    t.id === track.id ? { ...t, muted: !t.muted } : t,
                  ),
                })
              }
            >
              M
            </button>
            <button
              type="button"
              className={track.solo ? "solo" : ""}
              aria-pressed={track.solo}
              aria-label={`Solo ${track.name}`}
              onClick={() =>
                onChange({
                  ...session,
                  tracks: session.tracks.map((t) =>
                    t.id === track.id ? { ...t, solo: !t.solo } : t,
                  ),
                })
              }
            >
              S
            </button>
          </div>
        </section>
      ))}
      <section className="mixer-channel master-channel">
        <strong>
          <Volume2 size={14} /> Master
        </strong>
        <div className="channel-fader">
          <input
            aria-label="Master volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={session.master}
            onChange={(e) => onChange({ ...session, master: Number(e.target.value) })}
          />
          <div className="vertical-meter">
            <i style={{ height: `${Math.min(100, (meters["master"] ?? 0) * 200)}%` }} />
          </div>
        </div>
        <small>
          <Activity size={12} /> Safety limiter
        </small>
      </section>
    </div>
  );
}
