"""Cut Emma's handwritten phrases out of the Canva screenshots as sharp, transparent images.

Her handwriting font is not available as a web font, so the phrases she set in
it are shown as her own lettering. Each crop is upscaled four times with
Real-ESRGAN first (see enhance.py), then this script keeps only the ink and
paints it in her coral, so the edges stay clean at any size.

The letter is also saved a second time for phones, with the same words set on
five short lines. Three long lines would be too small to read on a narrow screen.

usage: python tools/lettering.py     (run from projects/weddingv2)
Reads scratch/upscale/<name>-src.png and <name>-x4.png, writes
apps/web/src/assets/lettering/<name>.webp and prints each phrase's box on its
Canva panel.

Needs numpy, scipy and pillow (use a venv).
"""

import os

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SRC = "scratch/upscale"
OUT = "apps/web/src/assets/lettering"
SCALE = 4
PAPER = np.array([246.0, 237.0, 230.0])
CORAL = (241, 110, 80)

# name -> (crop x, y, w, h on the full screenshot, top of its panel on that screenshot)
PHRASES = {
    "tagline": ((312, 1089, 730, 110), 768),
    "letter": ((630, 1788, 682, 166), 1536),
    "day-saturday": ((504, 2468, 358, 64), 2304),
    "in-town": ((108, 3105, 432, 83), 3072),
    "day-friday": ((520, 3255, 324, 64), 3072),
}

# Emma's letter is cut into pieces wherever her writing has a clear gap. A piece is
# one word, or two words that touch. These are the pieces on each of her three lines:
#   0: "Dear family and" | "friends,"
#   1: seven pieces. The first four read "We would be delighted for you", the rest "to join us in"
#   2: "Wichita," | "Kansas" | "on" | "to" | "celebrate" | "our" | "marriage" | "together."
# The "on" is a stray word in her design and is left out.
PIECE_GAP = 10 * SCALE
LETTER_PIECES = [2, 7, 8]
STRAY = (2, 2)
# A bud of the bouquet beside the letter reaches into the top-left corner of the crop,
# level with the first two lines. Clear that corner. The third line starts lower down.
LETTER_CLEAR_COLUMNS = 16 * SCALE
LETTER_CLEAR_ROWS = 109 * SCALE
# The same pieces on five short lines, for a phone. Each entry is (her line, piece).
LETTER_NARROW = [
    [(0, 0), (0, 1)],  # Dear family and friends,
    [(1, 0), (1, 1), (1, 2), (1, 3)],  # We would be delighted for you
    [(1, 4), (1, 5), (1, 6), (2, 0)],  # to join us in Wichita,
    [(2, 1), (2, 3), (2, 4)],  # Kansas to celebrate
    [(2, 5), (2, 6), (2, 7)],  # our marriage together.
]


def ink_alpha(sharp: np.ndarray, soft: np.ndarray) -> np.ndarray:
    """How much ink covers each pixel, from 0 to 1."""
    blur = (10, 10, 0)
    matched = np.clip(sharp + gaussian_filter(soft, blur) - gaussian_filter(sharp, blur), 0, 255)
    # Full ink is the solid coral. Anything closer to the paper is partly covered.
    distance = np.abs(matched - PAPER).sum(axis=2)
    full = np.abs(np.array(CORAL, dtype=float) - PAPER).sum()
    return np.clip((distance / full - 0.1) / 0.8, 0.0, 1.0)


def line_bands(alpha: np.ndarray) -> list[tuple[int, int]]:
    """Top and bottom of each line of writing."""
    rows = (alpha > 0.3).any(axis=1)
    bands = []
    start = None
    for y, on in enumerate(rows):
        if on and start is None:
            start = y
        elif not on and start is not None:
            if y - start > 20:
                bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, len(rows)))
    return bands


def words_on(alpha: np.ndarray, top: int, bottom: int, gap: int) -> list[tuple[int, int]]:
    columns = (alpha[top:bottom] > 0.3).any(axis=0)
    words = []
    start = None
    last = 0
    for x, on in enumerate(columns):
        if on:
            if start is None:
                start = x
            elif x - last > gap:
                words.append((start, last))
                start = x
            last = x
    if start is not None:
        words.append((start, last))
    return words


def letter_lines(alpha: np.ndarray) -> list[tuple[int, int, list[tuple[int, int]]]]:
    """Each line of the letter as (top, bottom, piece boxes)."""
    bands = line_bands(alpha)
    if len(bands) != len(LETTER_PIECES):
        raise SystemExit(f"expected {len(LETTER_PIECES)} lines in the letter, found {len(bands)}")
    lines = []
    for (top, bottom), count in zip(bands, LETTER_PIECES, strict=True):
        pieces = words_on(alpha, top, bottom, PIECE_GAP)
        if len(pieces) != count:
            raise SystemExit(f"expected {count} pieces on a line of the letter, found {len(pieces)}")
        lines.append((top, bottom, pieces))
    return lines


def fix_letter(alpha: np.ndarray) -> np.ndarray:
    """Emma's letter reads "Wichita, Kansas on to celebrate". Remove the stray "on" and re-center the line."""
    line_index, piece_index = STRAY
    top, bottom, pieces = letter_lines(alpha)[line_index]
    top, bottom = top - 8, alpha.shape[0]
    stray_left = pieces[piece_index][0]
    next_left = pieces[piece_index + 1][0]
    removed = next_left - stray_left
    line = alpha[top:bottom].copy()
    line[:, stray_left:-removed] = line[:, next_left:]
    line[:, -removed:] = 0.0
    fixed = alpha.copy()
    fixed[top:bottom] = np.roll(line, removed // 2, axis=1)
    return fixed


def narrow_letter(alpha: np.ndarray) -> np.ndarray:
    """The letter set on short lines for a phone, from Emma's own words."""
    lines = letter_lines(alpha)
    tops = [top for top, _, _ in lines]
    pitch = round((tops[-1] - tops[0]) / (len(tops) - 1))
    tallest = max(bottom - top for top, bottom, _ in lines)
    gaps = [b[0] - a[1] for _, _, pieces in lines for a, b in zip(pieces, pieces[1:])]
    usual_gap = int(np.median(gaps))

    rows = []
    for layout in LETTER_NARROW:
        pieces = []
        previous = None
        for line_index, piece_index in layout:
            top, bottom, boxes = lines[line_index]
            left, right = boxes[piece_index]
            if previous is not None:
                # Pieces that were neighbors keep the space Emma's line had between them.
                neighbors = previous[0] == line_index and previous[1] + 1 == piece_index
                gap = left - boxes[piece_index - 1][1] if neighbors else usual_gap
                pieces.append(np.zeros((tallest, gap)))
            piece = np.zeros((tallest, right - left + 1))
            piece[: bottom - top] = alpha[top:bottom, left : right + 1]
            pieces.append(piece)
            previous = (line_index, piece_index)
        rows.append(np.concatenate(pieces, axis=1))

    width = max(row.shape[1] for row in rows)
    canvas = np.zeros((pitch * (len(rows) - 1) + tallest, width))
    for index, row in enumerate(rows):
        left = (width - row.shape[1]) // 2
        region = canvas[index * pitch : index * pitch + tallest, left : left + row.shape[1]]
        np.maximum(region, row, out=region)
    return canvas


def save(alpha: np.ndarray, name: str) -> tuple[int, int, int, int]:
    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[..., :3] = CORAL
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")
    box = image.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    image = image.crop(box)
    path = os.path.join(OUT, f"{name}.webp")
    image.save(path, "WEBP", lossless=True, method=6)
    print(f"{name}: {image.size[0]}x{image.size[1]}, {os.path.getsize(path) // 1024} KB", end="")
    return box


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, ((x, y, w, h), panel_top) in PHRASES.items():
        crop = Image.open(os.path.join(SRC, f"{name}-src.png")).convert("RGB")
        sharp = np.asarray(Image.open(os.path.join(SRC, f"{name}-x4.png")).convert("RGB")).astype(float)
        soft = np.asarray(crop.resize((w * SCALE, h * SCALE), Image.Resampling.LANCZOS)).astype(float)
        alpha = ink_alpha(sharp, soft)

        if name == "letter":
            alpha[:LETTER_CLEAR_ROWS, :LETTER_CLEAR_COLUMNS] = 0.0
            save(narrow_letter(alpha), "letter-narrow")
            print()
            alpha = fix_letter(alpha)

        box = save(alpha, name)
        panel_box = [x + box[0] / SCALE, y - panel_top + box[1] / SCALE, (box[2] - box[0]) / SCALE, (box[3] - box[1]) / SCALE]
        print(f", panel box {[round(v, 2) for v in panel_box]}")


if __name__ == "__main__":
    main()
