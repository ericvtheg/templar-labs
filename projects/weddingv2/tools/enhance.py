"""Make a sharp, transparent cut-out of Emma's Canva art from an upscaled crop.

The Canva screenshots are 1366 px wide, so the art in them is small. A crop is
first upscaled four times with Real-ESRGAN (model realesrgan-x4plus), which
sharpens the strokes without redrawing them. This script then:

  1. puts the original colors back. The upscaler shifts tones a little, so the
     soft colors come from the plain upscale and only the detail from the sharp one.
  2. removes the paper with color-to-alpha (see cutout.py).
  3. trims, resizes and reports where the art sat on its Canva panel.

usage: python tools/enhance.py <crop.png> <crop-realesrgan-x4.png> <out.png>
                               --origin x,y [--no-trim] [--max 1700]

--origin is the crop's top-left corner on the Canva panel, in panel pixels.
Needs numpy, scipy and pillow (use a venv).
"""

import argparse

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from cutout import color_to_alpha

SCALE = 4
PAPER = np.array([246, 237, 230])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("crop")
    parser.add_argument("sharp")
    parser.add_argument("out")
    parser.add_argument("--origin", default="0,0")
    parser.add_argument("--no-trim", action="store_true")
    parser.add_argument("--max", type=int, default=1700)
    parser.add_argument("--floor", type=float, default=0.045)
    args = parser.parse_args()

    crop = Image.open(args.crop).convert("RGB")
    sharp = np.asarray(Image.open(args.sharp).convert("RGB")).astype(np.float64)
    size = (crop.width * SCALE, crop.height * SCALE)
    if (sharp.shape[1], sharp.shape[0]) != size:
        raise SystemExit(f"{args.sharp} is not {SCALE}x the crop")
    soft = np.asarray(crop.resize(size, Image.Resampling.LANCZOS)).astype(np.float64)

    # Keep the sharp image's detail, but take the broad color from the original.
    blur = (10, 10, 0)
    matched = np.clip(sharp + gaussian_filter(soft, blur) - gaussian_filter(sharp, blur), 0, 255)

    rgba = color_to_alpha(matched.round().astype(np.uint8), PAPER, args.floor)
    image = Image.fromarray((rgba * 255.0).round().astype(np.uint8), "RGBA")

    origin_x, origin_y = (float(v) for v in args.origin.split(","))
    box = (0, 0, image.width, image.height)
    if not args.no_trim:
        box = image.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox() or box
        image = image.crop(box)
    if max(image.size) > args.max:
        image.thumbnail((args.max, args.max), Image.Resampling.LANCZOS)
    image.save(args.out)

    panel = [origin_x + box[0] / SCALE, origin_y + box[1] / SCALE, (box[2] - box[0]) / SCALE, (box[3] - box[1]) / SCALE]
    print(f"saved {args.out} {image.size}")
    print("on the Canva panel (x, y, w, h):", [round(v, 2) for v in panel])


if __name__ == "__main__":
    main()
