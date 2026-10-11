import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { PhotoSlot } from "../content/photos.ts";
import { type ArtName, art } from "../shared/art.ts";
import { Photo } from "../shared/Photo.tsx";
import { seeded } from "../shared/random.ts";

/** A clip-path polygon with a rough, hand-torn edge. */
export function deckle(seed: number, steps = 18, depth = 1.5): string {
  const random = seeded(seed);
  const points: string[] = [];
  const corners: readonly [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const inward: readonly [number, number][] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];

  for (let side = 0; side < 4; side += 1) {
    const from = corners[side] ?? [0, 0];
    const to = corners[(side + 1) % 4] ?? [0, 0];
    const push = inward[side] ?? [0, 0];
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      const jitter = random() * depth;
      const x = from[0] + (to[0] - from[0]) * progress + push[0] * jitter;
      const y = from[1] + (to[1] - from[1]) * progress + push[1] * jitter;
      points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
  }

  return `polygon(${points.join(",")})`;
}

type FrameProps = {
  slot: PhotoSlot;
  seed: number;
  className?: string;
  tape?: "left" | "right" | "none";
};

/** A photo in a deckled paper frame, held down with a strip of tape. */
export function Frame({ slot, seed, className, tape = "left" }: FrameProps) {
  const clipPath = useMemo(() => deckle(seed), [seed]);

  return (
    <figure className={className ? `v2-frame ${className}` : "v2-frame"}>
      <div className="v2-frame__paper" style={{ clipPath }}>
        <Photo slot={slot} className="v2-frame__photo" eager />
      </div>
      {tape !== "none" && <span className="v2-frame__tape" data-side={tape} aria-hidden="true" />}
    </figure>
  );
}

type StemProps = {
  name: ArtName;
  className?: string;
  /** Seconds before the stem grows in. */
  delay?: number;
  /** Sway angle in degrees. */
  sway?: number;
  style?: CSSProperties;
};

/** A flower that grows in from its base, then sways. */
export function Stem({ name, className, delay = 0, sway = 2, style }: StemProps) {
  const vars = {
    "--grow-delay": `${delay}s`,
    "--sway": `${sway}deg`,
    "--sway-time": `${5.5 + ((delay * 7) % 3)}s`,
    ...style,
  } as CSSProperties;

  return (
    <span
      className={className ? `v2-stem ${className}` : "v2-stem"}
      style={vars}
      aria-hidden="true"
    >
      <img src={art[name]} alt="" />
    </span>
  );
}

type MeadowStem = { name: ArtName; side: "left" | "right"; offset: number; height: number };

/** A few stems growing along the bottom edge of a page. Sizes are in panel pixels. */
export function Meadow({ stems }: { stems: readonly MeadowStem[] }) {
  return (
    <div className="v2-meadow" aria-hidden="true">
      {stems.map((stem, index) => (
        <Stem
          key={`${stem.name}-${stem.side}-${stem.offset}`}
          name={stem.name}
          delay={0.15 + index * 0.12}
          sway={1.2 + (index % 3) * 0.5}
          style={
            {
              [stem.side]: `calc(${stem.offset} * var(--u))`,
              "--stem-height": `calc(${stem.height} * var(--u))`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A hand-drawn underline. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 6 C 9 1.5, 15 9, 23 5.5 S 37 1.5, 45 5.5 S 59 9.5, 67 5.5 S 81 1.5, 89 5.5 S 103 9, 118 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const leafSpots = [70, 168, 262, 372, 470, 566, 668, 764, 872, 968, 1064, 1150] as const;

/** A vine that draws itself from left to right, then puts out leaves. */
export function Vine({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `v2-vine ${className}` : "v2-vine"}
      viewBox="0 0 1220 90"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="v2-vine__line"
        pathLength={1}
        d="M4 46 C 80 18, 150 72, 240 44 S 400 16, 480 46 S 640 76, 730 44 S 890 14, 980 46 S 1130 72, 1216 40"
      />
      {leafSpots.map((x, index) => {
        const up = index % 2 === 0;
        const y = 45 + Math.sin((x / 1220) * Math.PI * 5) * 12;
        return (
          <path
            key={x}
            className="v2-vine__leaf"
            style={{ "--leaf-delay": `${0.5 + (x / 1220) * 1.1}s` } as CSSProperties}
            transform={`translate(${x} ${y}) rotate(${up ? -52 : 48})`}
            d="M0 0 C 5 -9, 18 -10, 25 -2 C 17 4, 6 5, 0 0 Z"
          />
        );
      })}
    </svg>
  );
}

type Petal = { id: number; style: CSSProperties };

const petalColors = ["#EE8E79", "#E8B4AC", "#E3C07E", "#F0A492"] as const;

function makePetals(seed: number): Petal[] {
  const random = seeded(seed);
  return Array.from({ length: 16 }, (_, id) => {
    const startX = -12 + random() * 70;
    const drift = 42 + random() * 44;
    return {
      id,
      style: {
        "--x0": `${startX}vw`,
        "--y0": `${-12 - random() * 14}vh`,
        "--x1": `${startX + drift}vw`,
        "--y1": `${108 + random() * 10}vh`,
        "--r0": `${Math.round(random() * 360)}deg`,
        "--r1": `${Math.round(360 + random() * 540)}deg`,
        "--size": `${14 + random() * 16}px`,
        "--time": `${1.15 + random() * 0.75}s`,
        "--delay": `${random() * 0.32}s`,
        "--petal": petalColors[id % petalColors.length],
      } as CSSProperties,
    };
  });
}

/** A flurry of petals that crosses the screen whenever `trigger` changes. */
export function Petals({ trigger }: { trigger: string }) {
  const previous = useRef(trigger);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (previous.current === trigger) {
      return;
    }
    previous.current = trigger;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    setBurst((count) => count + 1);
  }, [trigger]);

  useEffect(() => {
    if (burst === 0) {
      return;
    }
    const timer = window.setTimeout(() => setBurst(0), 2400);
    return () => window.clearTimeout(timer);
  }, [burst]);

  const petals = useMemo(() => (burst === 0 ? [] : makePetals(burst * 7919)), [burst]);
  if (burst === 0) {
    return null;
  }

  return (
    <div className="v2-petals" key={burst} aria-hidden="true">
      {petals.map((petal) => (
        <svg
          key={petal.id}
          viewBox="-10 -14 20 28"
          style={petal.style}
          aria-hidden="true"
          focusable="false"
        >
          <path d="M0 -13 C 8 -7, 9 6, 0 13 C -9 6, -8 -7, 0 -13 Z" />
        </svg>
      ))}
    </div>
  );
}
