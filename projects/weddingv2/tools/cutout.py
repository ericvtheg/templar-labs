"""Cut an illustration out of a flat-background image with color-to-alpha.

A hard color key drops the faint pastel pencil strokes, so this uses the GIMP
color-to-alpha model instead: every pixel becomes the most transparent color
that still composites back to the original over the background.

usage: python tools/cutout.py <in> <out.png> [--crop x,y,w,h] [--bg r,g,b]
                              [--scale 2] [--floor 0.035] [--max 1600]

Needs numpy and pillow (use a venv; they are not installed globally).
"""

import argparse

import numpy as np
from PIL import Image


def color_to_alpha(rgb: np.ndarray, bg: np.ndarray, floor: float) -> np.ndarray:
    pixels = rgb.astype(np.float64) / 255.0
    back = bg.astype(np.float64) / 255.0
    # Pencil on paper only ever darkens a channel. Pixels brighter than the paper are
    # noise, and the model would amplify them because the paper is close to white.
    alpha = (np.maximum(back - pixels, 0.0) / np.maximum(back, 1e-6)).max(axis=2)
    safe = np.maximum(alpha, 1e-6)[..., None]
    color = np.clip((pixels - back) / safe + back, 0.0, 1.0)
    # JPEG noise sits just above zero. Subtract a floor so the paper stays clean.
    alpha = np.clip((alpha - floor) / (1.0 - floor), 0.0, 1.0)
    return np.dstack([color, alpha])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("out")
    parser.add_argument("--crop")
    parser.add_argument("--bg", default="246,237,230")
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--floor", type=float, default=0.035)
    parser.add_argument("--max", type=int, default=0)
    parser.add_argument("--no-trim", action="store_true")
    args = parser.parse_args()

    image = Image.open(args.src).convert("RGB")
    if args.crop:
        x, y, w, h = (int(v) for v in args.crop.split(","))
        image = image.crop((x, y, x + w, y + h))
    if args.scale != 1.0:
        size = (round(image.width * args.scale), round(image.height * args.scale))
        image = image.resize(size, Image.Resampling.LANCZOS)

    bg = np.array([int(v) for v in args.bg.split(",")])
    rgba = color_to_alpha(np.asarray(image), bg, args.floor)
    out = Image.fromarray((rgba * 255.0).round().astype(np.uint8), "RGBA")

    if not args.no_trim:
        box = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if box:
            out = out.crop(box)
    if args.max and max(out.size) > args.max:
        out.thumbnail((args.max, args.max), Image.Resampling.LANCZOS)

    out.save(args.out)
    print("saved", args.out, out.size)


if __name__ == "__main__":
    main()
