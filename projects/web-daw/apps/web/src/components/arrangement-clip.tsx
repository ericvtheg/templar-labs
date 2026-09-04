import { useRef, useState } from "react";
import { soundById } from "../lib/catalog";
import type { Clip, Track } from "../lib/session";

function resize(
  clip: Clip,
  side: "left" | "right",
  delta: number,
  bars: number,
  length: number,
): Clip {
  if (side === "right") {
    return { ...clip, bars: Math.max(1, Math.min(bars - clip.start, clip.bars + delta)) };
  }
  const start = Math.max(0, Math.min(clip.start + clip.bars - 1, clip.start + delta));
  return {
    ...clip,
    start,
    bars: clip.start + clip.bars - start,
    offset: ((((clip.offset ?? 0) + (start - clip.start) * 16) % length) + length) % length,
  };
}
export function ArrangementClip({
  clip,
  track,
  bars,
  selected,
  onSelect,
  onOpen,
  onResize,
}: {
  clip: Clip;
  track: Track;
  bars: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onResize: (clip: Clip) => void;
}) {
  const drag = useRef<{ x: number; original: Clip; next: Clip } | null>(null);
  const [preview, setPreview] = useState<Clip | null>(null);
  const pattern = clip.pattern ?? track;
  const visible = preview ?? clip;
  return (
    <div
      className={`arrangement-clip ${selected ? "selected" : ""}`}
      style={{
        left: `${(visible.start / bars) * 100}%`,
        width: `calc(${(visible.bars / bars) * 100}% - 4px)`,
      }}
    >
      <button
        type="button"
        className="clip-body"
        aria-label={`${track.name} clip at bar ${clip.start + 1}`}
        draggable
        onDragStart={(event) => {
          const box = event.currentTarget.parentElement?.getBoundingClientRect();
          const lane = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
          event.dataTransfer.setData(
            "application/clip",
            JSON.stringify({
              trackId: track.id,
              id: clip.id,
              offset:
                box && lane ? Math.floor(((event.clientX - box.left) / lane.width) * bars) : 0,
              copy: event.altKey,
            }),
          );
          event.dataTransfer.effectAllowed = "copyMove";
        }}
        onClick={onSelect}
        onDoubleClick={onOpen}
      >
        <span>{track.name}</span>
        <svg
          className="clip-preview"
          viewBox="0 0 200 22"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {pattern.notes.map((note) => (
            <rect
              key={`${note.step}-${note.pitch}`}
              x={(note.step / pattern.length) * 198}
              y={
                soundById(track.sound).kind === "sample"
                  ? 2 + (1 - note.velocity) * 10
                  : 18 - ((note.pitch % 24) / 24) * 17
              }
              width={Math.max(2, (note.duration / pattern.length) * 190)}
              height={soundById(track.sound).kind === "sample" ? note.velocity * 16 : 2.4}
              rx=".5"
            />
          ))}
        </svg>
      </button>
      {(["left", "right"] as const).map((side) => (
        <button
          type="button"
          key={side}
          className={`clip-resize ${side}`}
          aria-label={`${side === "left" ? "Start" : "End"} of ${track.name} clip at bar ${clip.start + 1}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect();
            drag.current = { x: event.clientX, original: clip, next: clip };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            const width =
              event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width;
            if (!active || !width) {
              return;
            }
            const next = resize(
              active.original,
              side,
              Math.round(((event.clientX - active.x) / width) * bars),
              bars,
              pattern.length,
            );
            if (
              track.clips.some(
                (c) =>
                  c.id !== clip.id &&
                  next.start < c.start + c.bars &&
                  next.start + next.bars > c.start,
              )
            ) {
              return;
            }
            active.next = next;
            setPreview(next);
          }}
          onPointerUp={() => {
            if (drag.current) {
              onResize(drag.current.next);
            }
            drag.current = null;
            setPreview(null);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setPreview(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            onResize(resize(clip, side, event.key === "ArrowRight" ? 1 : -1, bars, pattern.length));
          }}
        />
      ))}
    </div>
  );
}
