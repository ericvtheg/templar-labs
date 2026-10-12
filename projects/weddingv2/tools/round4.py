"""Cut the new art and photos out of Emma's fourth Canva export.

Round four changed the FAQ illustration and added a photo to each thing to do.
The illustration is upscaled and cleaned like the others (see round3.py). The
photos are saved as they are: an upscaler would redraw faces and details.

usage: python tools/round4.py [--skip-upscale]     (run from projects/weddingv2)

Photos of places go to apps/web/src/assets/round-4/places and are committed.
Photos of Emma and Eric go to apps/web/src/assets/photos, which is not in git.
"""

import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import round3  # noqa: E402
from cutout import color_to_alpha  # noqa: E402

round3.REF = "reference/round-4"
ART_OUT = "apps/web/src/assets/round-4"
PLACES_OUT = "apps/web/src/assets/round-4/places"
PEOPLE_OUT = "apps/web/src/assets/photos"
SCALE = round3.SCALE

# The new FAQ illustration: (file, panel index, crop x, y, w, h on that panel).
FAQ_ART = ("faq.png", 0, (0, 330, 500, 438))

# name -> (panel index in things.png, crop x, y, w, h, output folder)
PHOTOS = {
    "dead-center-vintage": (1, (715, 215, 407, 408), PLACES_OUT),
    "chisholm-creek-park": (2, (709, 258, 432, 462), PLACES_OUT),
    "watermark-books": (3, (701, 259, 432, 461), PLACES_OUT),
    "cowtown": (4, (696, 274, 462, 365), PEOPLE_OUT),
}


def main() -> None:
    skip = "--skip-upscale" in sys.argv
    for folder in (ART_OUT, PLACES_OUT, PEOPLE_OUT, round3.WORK):
        os.makedirs(folder, exist_ok=True)

    file, panel, box = FAQ_ART
    crop = round3.crop_of(file, panel, box)
    sharp = round3.upscaled("r4-faq-flowers", crop, skip)
    soft = round3.soft_of(crop)
    blur = (10, 10, 0)
    matched = np.clip(sharp + gaussian_filter(soft, blur) - gaussian_filter(sharp, blur), 0, 255)
    rgba = color_to_alpha(matched.round().astype(np.uint8), round3.PAPER, 0.045)
    image = Image.fromarray((rgba * 255.0).round().astype(np.uint8), "RGBA")
    image.thumbnail((1500, 1500), Image.Resampling.LANCZOS)
    path = os.path.join(ART_OUT, "faq-flowers.webp")
    image.save(path, "WEBP", quality=82, alpha_quality=92, method=6)
    print(f"faq-flowers: {image.size[0]}x{image.size[1]}, {os.path.getsize(path) // 1024} KB, panel box {list(box)}")

    for name, (panel, box, folder) in PHOTOS.items():
        photo = round3.crop_of("things.png", panel, box)
        path = os.path.join(folder, f"{name}.jpg")
        photo.save(path, "JPEG", quality=92)
        print(f"{name}: {photo.size[0]}x{photo.size[1]}, {os.path.getsize(path) // 1024} KB -> {path}")


if __name__ == "__main__":
    main()
