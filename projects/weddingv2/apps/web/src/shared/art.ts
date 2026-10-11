// Illustration URLs. The bouquet and lily are Emma's Canva art, cut out with
// tools/cutout.py. The rest were generated in her style (tools/gen-sheets.mjs).

import airplane from "../assets/art/airplane.webp";
import arch from "../assets/art/arch.webp";
import bell from "../assets/art/bell.webp";
import books from "../assets/art/books.webp";
import boot from "../assets/art/boot.webp";
import bouquet from "../assets/art/bouquet.webp";
import bowtie from "../assets/art/bowtie.webp";
import car from "../assets/art/car.webp";
import chair from "../assets/art/chair.webp";
import cocktail from "../assets/art/cocktail.webp";
import coupes from "../assets/art/coupes.webp";
import deer from "../assets/art/deer.webp";
import dress from "../assets/art/dress.webp";
import garland from "../assets/art/garland.webp";
import gift from "../assets/art/gift.webp";
import growBuds from "../assets/art/grow-buds.webp";
import growCosmos from "../assets/art/grow-cosmos.webp";
import growGrass from "../assets/art/grow-grass.webp";
import growLily from "../assets/art/grow-lily.webp";
import growRoses from "../assets/art/grow-roses.webp";
import growSunflower from "../assets/art/grow-sunflower.webp";
import key from "../assets/art/key.webp";
import lily from "../assets/art/lily.webp";
import moon from "../assets/art/moon.webp";
import plate from "../assets/art/plate.webp";
import stemBuds from "../assets/art/stem-buds.webp";
import stemCosmos from "../assets/art/stem-cosmos.webp";
import stemLily from "../assets/art/stem-lily.webp";
import stemRose from "../assets/art/stem-rose.webp";
import stemSprig from "../assets/art/stem-sprig.webp";
import stemSunflower from "../assets/art/stem-sunflower.webp";
import suitcase from "../assets/art/suitcase.webp";
import sun from "../assets/art/sun.webp";

export const art = {
  airplane,
  arch,
  bell,
  books,
  boot,
  bouquet,
  bowtie,
  car,
  chair,
  cocktail,
  coupes,
  deer,
  dress,
  garland,
  gift,
  growBuds,
  growCosmos,
  growGrass,
  growLily,
  growRoses,
  growSunflower,
  key,
  lily,
  moon,
  plate,
  stemBuds,
  stemCosmos,
  stemLily,
  stemRose,
  stemSprig,
  stemSunflower,
  suitcase,
  sun,
} as const;

export type ArtName = keyof typeof art;

/** One spot illustration per content item, for the versions that use them. */
export const artFor: Record<string, ArtName> = {
  // schedule
  wedding: "arch",
  "welcome-party": "coupes",
  seated: "chair",
  start: "arch",
  end: "moon",
  // hotels
  "hotel-at-old-town": "key",
  "ambassador-hotel": "bell",
  "hilton-garden-inn": "suitcase",
  // things to do
  "dead-center-vintage": "dress",
  "chisholm-creek-park": "deer",
  "watermark-books": "books",
  cowtown: "boot",
  food: "plate",
  // faq
  "indoor-or-outdoors": "arch",
  weather: "sun",
  "dress-code": "bowtie",
  kids: "chair",
  "plus-ones": "coupes",
  "open-bar": "cocktail",
  gifts: "gift",
  "getting-to-wichita": "airplane",
};
