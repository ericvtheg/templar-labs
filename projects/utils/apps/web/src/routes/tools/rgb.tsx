import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@templar/ui/components/input";
import { useMemo, useState } from "react";
import { CopyButton, ToolFrame } from "../../components/tool-frame";

export const Route = createFileRoute("/tools/rgb")({
  component: RgbTool,
});

type Rgb = { r: number; g: number; b: number };

function clamp(n: number, max: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.max(0, Math.min(max, n));
}

function parseHex(input: string): Rgb | null {
  const trimmed = input.trim().replace(/^#/, "");
  const match =
    /^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(trimmed) ??
    /^([\da-f])([\da-f])([\da-f])$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const parts = match.slice(1).map((part) => {
    const p = part ?? "";
    if (p.length === 1) {
      return Number.parseInt(`${p}${p}`, 16);
    }
    return Number.parseInt(p, 16);
  });
  return {
    b: parts[2] ?? 0,
    g: parts[1] ?? 0,
    r: parts[0] ?? 0,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hp < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hp < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (hp < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (hp < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else if (hp < 6) {
    [r1, g1, b1] = [c, 0, x];
  }
  const m = ln - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function channelLuminance(n: number): number {
  const c = n / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function RgbTool() {
  const [hexInput, setHexInput] = useState("#1f2937");
  const [rgbInput, setRgbInput] = useState("31, 41, 55");
  const [hslInput, setHslInput] = useState("215, 28, 17");

  const rgb = useMemo<Rgb | null>(() => parseHex(hexInput), [hexInput]);

  const preview = rgb ?? { r: 0, g: 0, b: 0 };
  const hsl = rgb ? rgbToHsl(rgb) : rgbToHsl(preview);
  const contrastVsWhite = contrast(preview, { r: 255, g: 255, b: 255 });
  const contrastVsBlack = contrast(preview, { r: 0, g: 0, b: 0 });

  const handleHex = (value: string) => {
    setHexInput(value);
    const parsed = parseHex(value);
    if (parsed) {
      setRgbInput(`${parsed.r}, ${parsed.g}, ${parsed.b}`);
      const h = rgbToHsl(parsed);
      setHslInput(`${h.h}, ${h.s}, ${h.l}`);
    }
  };

  const handleRgb = (value: string) => {
    setRgbInput(value);
    const parts = value.split(",").map((p) => Number.parseInt(p.trim(), 10));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const next: Rgb = {
        r: clamp(parts[0] ?? 0, 255),
        g: clamp(parts[1] ?? 0, 255),
        b: clamp(parts[2] ?? 0, 255),
      };
      setHexInput(rgbToHex(next));
      const h = rgbToHsl(next);
      setHslInput(`${h.h}, ${h.s}, ${h.l}`);
    }
  };

  const handleHsl = (value: string) => {
    setHslInput(value);
    const parts = value.split(",").map((p) => Number.parseInt(p.trim(), 10));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const next = hslToRgb(
        clamp(parts[0] ?? 0, 360),
        clamp(parts[1] ?? 0, 100),
        clamp(parts[2] ?? 0, 100),
      );
      setHexInput(rgbToHex(next));
      setRgbInput(`${next.r}, ${next.g}, ${next.b}`);
    }
  };

  return (
    <ToolFrame
      description="Convert between hex, RGB, and HSL. WCAG contrast included."
      title="RGB / HSL / Hex"
    >
      <div className="h-20 w-full rounded-lg border" style={{ backgroundColor: hexInput }} />

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Hex</p>
        <Input onChange={(e) => handleHex(e.target.value)} value={hexInput} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          RGB (r, g, b)
        </p>
        <Input onChange={(e) => handleRgb(e.target.value)} value={rgbInput} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          HSL (h, s%, l%)
        </p>
        <Input onChange={(e) => handleHsl(e.target.value)} value={hslInput} />
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 font-mono text-xs">
        <div>contrast vs white: {contrastVsWhite.toFixed(2)}</div>
        <div>contrast vs black: {contrastVsBlack.toFixed(2)}</div>
        <div>
          hsl: {hsl.h}, {hsl.s}%, {hsl.l}%
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CopyButton value={hexInput} label="Copy hex" />
        <CopyButton value={`rgb(${rgbInput})`} label="Copy rgb()" />
        <CopyButton value={`hsl(${hslInput})`} label="Copy hsl()" />
      </div>
    </ToolFrame>
  );
}
