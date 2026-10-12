"""Cut the art, lettering and photo out of Emma's third Canva export.

Every piece is cropped from reference/round-3, upscaled four times with
Real-ESRGAN, and then cleaned up the same way as before: illustrations with
color-to-alpha (see cutout.py and enhance.py), handwriting as coral ink only
(see lettering.py). The photo is saved as it is.

usage: python tools/round3.py [--skip-upscale]     (run from projects/weddingv2)
Needs numpy, scipy and pillow (use a venv), and the Real-ESRGAN binary in
scratch/upscale/realesrgan. It prints where each piece sits on its Canva panel.
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cutout import color_to_alpha  # noqa: E402
from lettering import ink_alpha, line_bands, words_on  # noqa: E402

REF = "reference/round-3"
WORK = "scratch/upscale"
ART_OUT = "apps/web/src/assets/round-3"
PHOTO_OUT = "apps/web/src/assets/photos/emma-eric.jpg"
ESRGAN = "scratch/upscale/realesrgan/realesrgan-ncnn-vulkan"
SCALE = 4
PANEL = 768
PAPER = np.array([246, 237, 230])
CORAL = (241, 110, 80)

# name -> (file, panel index, crop x, y, w, h on that panel, longest side in px, trim)
ART = {
    "bouquet": ("home.png", 0, (650, 50, 680, 670), 1500, True),
    "lily": ("things.png", 0, (0, 255, 490, 513), 1320, False),
    "faq-flowers": ("faq.png", 0, (0, 330, 500, 438), 1500, False),
}

# name -> (file, panel index, crop x, y, w, h on that panel)
LETTERING = {
    "tagline": ("home.png", 0, (70, 530, 446, 82)),
    "letter": ("home.png", 1, (728, 140, 536, 500)),
    "day-friday": ("home.png", 2, (520, 184, 326, 62)),
    "day-saturday": ("home.png", 3, (504, 164, 358, 64)),
}

# The photo on the second home panel, as (x, y, w, h).
PHOTO = ("home.png", 1, (68, 150, 645, 468))


def crop_of(file: str, panel: int, box: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = box
    top = panel * PANEL + y
    return Image.open(os.path.join(REF, file)).convert("RGB").crop((x, top, x + w, top + h))


def upscaled(name: str, crop: Image.Image, skip: bool) -> np.ndarray:
    source = os.path.join(WORK, f"r3-{name}-src.png")
    sharp = os.path.join(WORK, f"r3-{name}-x4.png")
    if not (skip and os.path.exists(sharp)):
        crop.save(source)
        subprocess.run(
            [ESRGAN, "-i", source, "-o", sharp, "-n", "realesrgan-x4plus", "-s", str(SCALE), "-m", os.path.join(os.path.dirname(ESRGAN), "models")],
            check=True,
            capture_output=True,
        )
    return np.asarray(Image.open(sharp).convert("RGB")).astype(float)


def soft_of(crop: Image.Image) -> np.ndarray:
    size = (crop.width * SCALE, crop.height * SCALE)
    return np.asarray(crop.resize(size, Image.Resampling.LANCZOS)).astype(float)


def letter_segments(alpha: np.ndarray, top: int, bottom: int, left: int, right: int) -> list[tuple[int, int]]:
    """Runs of ink between clear columns inside one word."""
    columns = (alpha[top:bottom, left : right + 1] > 0.3).any(axis=0)
    segments = []
    start = None
    for x, on in enumerate(columns):
        if on and start is None:
            start = x
        elif not on and start is not None:
            segments.append((left + start, left + x - 1))
            start = None
    if start is not None:
        segments.append((right - (len(columns) - 1 - start), right))
    return segments


def fix_accommodation(alpha: np.ndarray) -> np.ndarray:
    """Emma's letter spells "accomadation". Respell it from her own letters.

    The word's first six letters stand apart: a, c, c, o, m, a. The sixth is
    replaced by a copy of her "m" and a copy of her "o", which gives
    "accommodation". The line is then centered again.
    """
    bands = line_bands(alpha)
    if len(bands) != 8:
        raise SystemExit(f"expected 8 lines in the letter, found {len(bands)}")
    top, bottom = bands[5]
    word_left, word_right = words_on(alpha, top, bottom, 10 * SCALE)[0]
    segments = letter_segments(alpha, top, bottom, word_left, word_right)
    if len(segments) != 10:
        raise SystemExit(f"expected 10 letter groups in the misspelled word, found {len(segments)}")
    o_left, o_right = segments[3]
    m_left, m_right = segments[4]
    a_left, a_right = segments[5]
    gap = m_left - o_right - 1

    line = alpha[top:bottom]
    blank = np.zeros((bottom - top, gap))
    respelled = np.concatenate(
        [
            line[:, : a_left],
            line[:, m_left : m_right + 1],
            blank,
            line[:, o_left : o_right + 1],
            line[:, a_right + 1 :],
        ],
        axis=1,
    )
    # Trim the line to its ink, then center it on a canvas wide enough for it.
    ink = np.where((respelled > 0.3).any(axis=0))[0]
    respelled = respelled[:, ink[0] : ink[-1] + 1]
    width = max(alpha.shape[1], respelled.shape[1] + 8 * SCALE)
    grown = np.zeros((alpha.shape[0], width))
    offset = (width - alpha.shape[1]) // 2
    grown[:, offset : offset + alpha.shape[1]] = alpha
    grown[top:bottom] = 0.0
    start = (width - respelled.shape[1]) // 2
    grown[top:bottom, start : start + respelled.shape[1]] = respelled
    return grown


def report(name: str, path: str, image: Image.Image, panel_box: list[float]) -> None:
    print(f"{name}: {image.size[0]}x{image.size[1]}, {os.path.getsize(path) // 1024} KB, panel box {[round(v, 2) for v in panel_box]}")


def main() -> None:
    skip = "--skip-upscale" in sys.argv
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(ART_OUT, exist_ok=True)
    os.makedirs(os.path.dirname(PHOTO_OUT), exist_ok=True)

    for name, (file, panel, box, longest, trim) in ART.items():
        crop = crop_of(file, panel, box)
        sharp = upscaled(name, crop, skip)
        soft = soft_of(crop)
        # Keep the sharp image's detail, but take the broad color from the original.
        blur = (10, 10, 0)
        matched = np.clip(sharp + gaussian_filter(soft, blur) - gaussian_filter(sharp, blur), 0, 255)
        rgba = color_to_alpha(matched.round().astype(np.uint8), PAPER, 0.045)
        image = Image.fromarray((rgba * 255.0).round().astype(np.uint8), "RGBA")
        bounds = (0, 0, image.width, image.height)
        if trim:
            bounds = image.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox() or bounds
            image = image.crop(bounds)
        if max(image.size) > longest:
            image.thumbnail((longest, longest), Image.Resampling.LANCZOS)
        path = os.path.join(ART_OUT, f"{name}.webp")
        image.save(path, "WEBP", quality=82, alpha_quality=92, method=6)
        x, y, _, _ = box
        report(name, path, image, [x + bounds[0] / SCALE, y + bounds[1] / SCALE, (bounds[2] - bounds[0]) / SCALE, (bounds[3] - bounds[1]) / SCALE])

    for name, (file, panel, box) in LETTERING.items():
        crop = crop_of(file, panel, box)
        alpha = ink_alpha(upscaled(name, crop, skip), soft_of(crop))
        grew = 0
        if name == "letter":
            fixed = fix_accommodation(alpha)
            grew = (fixed.shape[1] - alpha.shape[1]) // 2
            alpha = fixed
        rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
        rgba[..., :3] = CORAL
        rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
        image = Image.fromarray(rgba, "RGBA")
        bounds = image.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        image = image.crop(bounds)
        path = os.path.join(ART_OUT, f"{name}.webp")
        image.save(path, "WEBP", lossless=True, method=6)
        x, y, _, _ = box
        report(name, path, image, [x + (bounds[0] - grew) / SCALE, y + bounds[1] / SCALE, (bounds[2] - bounds[0]) / SCALE, (bounds[3] - bounds[1]) / SCALE])

    file, panel, box = PHOTO
    photo = crop_of(file, panel, box)
    photo.save(PHOTO_OUT, "JPEG", quality=92)
    report("photo", PHOTO_OUT, photo, list(box))


if __name__ == "__main__":
    main()
