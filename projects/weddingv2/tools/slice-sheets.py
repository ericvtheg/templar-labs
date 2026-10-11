"""Slice the generated sheets into transparent pieces for apps/web/src/assets/art.

Each sheet is cut out with color-to-alpha against its own background color,
split on its empty gutters, trimmed and saved as WebP.

usage: python tools/slice-sheets.py   (run from projects/weddingv2)
Needs numpy and pillow (use a venv).
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cutout import color_to_alpha  # noqa: E402

SRC = "scratch/generated"
CUT = "scratch/cutouts"
OUT = "apps/web/src/assets/art"

# name -> (columns, rows, piece names in reading order, longest side in px)
SHEETS = {
    "stems": (6, 1, ["stem-cosmos", "stem-buds", "stem-sprig", "stem-lily", "stem-rose", "stem-sunflower"], 900),
    "travel": (3, 2, ["coupes", "airplane", "key", "suitcase", "car", "bell"], 520),
    "wichita": (3, 2, ["books", "dress", "boot", "deer", "plate", "cocktail"], 520),
    "wedding": (3, 2, ["arch", "chair", "moon", "sun", "gift", "bowtie"], 520),
    "garland": (1, 1, ["garland"], 2000),
}

# The meadow is saved as six growing stems. Its stems run off the bottom
# edge, so the bottom is never trimmed. The top rows hold a faint generation ghost.
# Two of the stems touch, so the cuts are fixed fractions of the width.
MEADOW_PARTS = ["grow-cosmos", "grow-lily", "grow-roses", "grow-buds", "grow-sunflower", "grow-grass"]
MEADOW_CUTS = [0.0, 0.176, 0.3475, 0.495, 0.6525, 0.811, 1.0]
MEADOW_CLEAR_ROWS = 228

# Finished cut-outs of Emma's own Canva art (made with tools/cutout.py).
CANVA = {"bouquet": 1252, "lily": 1026}


def background(rgb: np.ndarray) -> np.ndarray:
    edge = np.concatenate([rgb[:12].reshape(-1, 3), rgb[-12:].reshape(-1, 3), rgb[:, :12].reshape(-1, 3)])
    return np.median(edge, axis=0)


def bands(occupied: np.ndarray, count: int) -> list[tuple[int, int]]:
    """Split a 1-D occupancy profile into `count` bands at its widest inner gaps."""
    if count == 1:
        return [(0, len(occupied))]
    gaps = []
    start = None
    for index, value in enumerate(occupied):
        if not value and start is None:
            start = index
        elif value and start is not None:
            if start > 0:
                gaps.append((index - start, (start + index) // 2))
            start = None
    cuts = sorted(middle for _, middle in sorted(gaps, reverse=True)[: count - 1])
    if len(cuts) != count - 1:
        raise SystemExit(f"expected {count - 1} gutters, found {len(cuts)}")
    edges = [0, *cuts, len(occupied)]
    return list(zip(edges[:-1], edges[1:]))


def save(rgba: np.ndarray, name: str, longest: int, trim: str = "all", quality: int = 74) -> None:
    image = Image.fromarray((rgba * 255.0).round().astype(np.uint8), "RGBA")
    box = image.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
    if box and trim == "all":
        image = image.crop(box)
    elif box and trim == "keep-bottom":
        image = image.crop((box[0], box[1], box[2], image.height))
    if max(image.size) > longest:
        image.thumbnail((longest, longest), Image.Resampling.LANCZOS)
    path = os.path.join(OUT, f"{name}.webp")
    image.save(path, "WEBP", quality=quality, alpha_quality=90, method=6)
    print(f"{path}  {image.size[0]}x{image.size[1]}  {os.path.getsize(path) // 1024} KB")


def load(sheet: str) -> np.ndarray:
    rgb = np.asarray(Image.open(os.path.join(SRC, f"sheet-{sheet}.png")).convert("RGB"))
    # Generated backgrounds carry faint noise, so the floor is higher than for the Canva art.
    return color_to_alpha(rgb, background(rgb), floor=0.06)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    for name, longest in CANVA.items():
        image = Image.open(os.path.join(CUT, f"{name}.png")).convert("RGBA")
        save(np.asarray(image).astype(np.float64) / 255.0, name, longest, trim="none", quality=64)

    for sheet, (columns, rows, names, longest) in SHEETS.items():
        rgba = load(sheet)
        ink = rgba[..., 3] > 0.1
        pieces = []
        for top, bottom in bands(ink.any(axis=1), rows):
            for left, right in bands(ink[top:bottom].any(axis=0), columns):
                pieces.append(rgba[top:bottom, left:right])
        for piece, piece_name in zip(pieces, names, strict=True):
            save(piece, piece_name, longest, quality=68 if sheet == "garland" else 74)

    meadow = load("meadow")
    meadow[:MEADOW_CLEAR_ROWS, :, 3] = 0.0
    width = meadow.shape[1]
    for left, right, piece_name in zip(MEADOW_CUTS[:-1], MEADOW_CUTS[1:], MEADOW_PARTS, strict=True):
        save(meadow[:, round(left * width) : round(right * width)], piece_name, 820, trim="keep-bottom")


if __name__ == "__main__":
    main()
