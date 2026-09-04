import { useRef, useState } from "react";

type Region = { start: number; end: number };
type Handle = "start" | "end" | "move";
function adjust(region: Region, kind: Handle, delta: number, bars: number): Region {
  if (kind === "start") {
    return { ...region, start: Math.max(0, Math.min(region.end - 1, region.start + delta)) };
  }
  if (kind === "end") {
    return { ...region, end: Math.min(bars, Math.max(region.start + 1, region.end + delta)) };
  }
  const start = Math.max(0, Math.min(bars - (region.end - region.start), region.start + delta));
  return { start, end: start + region.end - region.start };
}
export function LoopBrace({
  start,
  end,
  bars,
  enabled,
  onChange,
}: Region & { bars: number; enabled: boolean; onChange: (start: number, end: number) => void }) {
  const lane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; region: Region; next: Region } | null>(null);
  const [preview, setPreview] = useState<Region | null>(null);
  const region = preview ?? { start, end };
  return (
    <div className={`loop-brace-lane ${enabled ? "" : "disabled"}`} ref={lane}>
      <div
        className="loop-brace"
        style={{
          left: `${(region.start / bars) * 100}%`,
          width: `${((region.end - region.start) / bars) * 100}%`,
        }}
      >
        {(["start", "move", "end"] as const).map((kind) => (
          <button
            type="button"
            key={kind}
            className={`loop-${kind}`}
            aria-label={
              kind === "move"
                ? "Move loop region"
                : `${kind === "start" ? "Start" : "End"} of loop region`
            }
            title="Drag to adjust loop region"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              const next = adjust({ start, end }, kind, event.key === "ArrowRight" ? 1 : -1, bars);
              onChange(next.start, next.end);
            }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, region: { start, end }, next: { start, end } };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              const width = lane.current?.getBoundingClientRect().width;
              if (!active || !width) {
                return;
              }
              active.next = adjust(
                active.region,
                kind,
                Math.round(((event.clientX - active.x) / width) * bars),
                bars,
              );
              setPreview(active.next);
            }}
            onPointerUp={() => {
              if (drag.current) {
                onChange(drag.current.next.start, drag.current.next.end);
              }
              drag.current = null;
              setPreview(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setPreview(null);
            }}
          >
            {kind === "move"
              ? `${region.start + 1} — ${region.end} · LOOP`
              : kind === "start"
                ? "⌜"
                : "⌝"}
          </button>
        ))}
      </div>
    </div>
  );
}
