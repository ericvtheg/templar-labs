# weddingv2

A design exploration for Emma and Eric's wedding website (September 25, 2027, Wichita, Kansas). It covers the landing page and the information guide. It has no RSVP.

Emma designed the site in Canva. The first round (versions 1 to 3) reinterpreted her design, and she did not want that. Versions 4 and 5 reproduce her Canva exactly and add only what she asked for. She liked version 4, then updated her Canva design. Versions 6 and 7 are that update: 6 is exactly what she laid out, and 7 is the same design with sizes and spacing tuned for computers and phones. Versions 8 and 9 add animation and her newest changes to version 7.

Live at <https://weddingv2.ericventor.com>. The pages ask search engines not to index them.

## Run it

```sh
pnpm --filter weddingv2-web dev
```

Open <http://127.0.0.1:5191>. The root page links to the three versions.

| Path | Version |
| --- | --- |
| `/v8` | **Animated, no photos of you.** Version 7 with squiggly lines, swaying flowers, a tagline that writes itself, and photos of places |
| `/v9` | **Animated, with your photos.** The same, with the homepage photo and the one at Cowtown |
| `/v6` | **Exactly Emma's update.** Her third Canva export, panel for panel: new wording, her photo, the serif names |
| `/v7` | **Recommended.** The same design with one type scale and a responsive layout. See below |
| `/v4` | **As Emma made it.** Her Canva, panel for panel, with her scroll. One spot for a photo on the homepage |
| `/v5` | **The same, no photo.** Exactly v4 with nothing added to her homepage |
| `/v1` | **As is.** Emma's Canva design, split into pages |
| `/v2` | **Riffed.** The same palette and type, with swaying florals, petals between pages and paper textures |
| `/v3` | **Super riffed.** The invitation suite, opened on a garden-party table |

Every page has its own URL in every version: `schedule`, `travel`, `stay`, `things-to-do` and `faq`. In v4 and v5 the homepage scrolls down into the schedule, and Travel is one page with the hotels below (`stay` opens it at the hotels). The small pill in the bottom-right corner opens the same page in another version. It is reviewer chrome, not part of the designs.

## Deploy it

A push to `main` deploys it through the repo's Deploy workflow. `alchemy.run.ts` publishes the built site to Cloudflare as static assets, with a fallback to the app shell so deep links work. To take it down, run `pnpm --filter weddingv2 run destroy` with the `templar-labs` Alchemy profile. (The Destroy project workflow in GitHub only lists some projects, and this is not one of them.)

## Versions 8 and 9: animation and round four

Emma's notes after versions 6 and 7, and her fourth export (`reference/round-4`), are in both:

| Her note | What versions 8 and 9 do |
| --- | --- |
| Make any of the straight lines an animated squiggly line | Every rule is a hand-drawn wavy line (`Squiggle` in `src/v8/motion.tsx`). It draws itself when it scrolls into view, then drifts slowly |
| Animate the flowers | The bouquet opens when the page loads. All three drawings then sway a few pixels, as if in a breeze. A planter box or log at the bottom of a drawing stays still |
| Or animate and write "Meet us in Kansas?" | It writes itself, word by word, when the homepage opens |
| A line after Getting around, before the hotels | Added, as a squiggle |
| Her new FAQ illustration | In place |
| A photo for each thing to do | Each one has its photo under its text. The lily stays in view beside the list while it scrolls |

They are built on version 7, because her note about the line before the hotels describes that layout. `src/v8` holds only what is new. The layout is still `src/v7/v7.css`.

**The difference between the two** is the photos that show Emma and Eric: the one on the homepage and the one at Cowtown. Version 8 leaves both out, so its letter stands alone and Cowtown has no photo. Version 9 has both. Photos of places are in both.

Things to know:

- All motion stops for people whose device asks for reduced motion
- Her page for the Cowtown photo repeats the Watermark Books title and text. The site uses the photo with the Cowtown entry
- The food list is kept under the last thing to do. Her pages with photos do not show it
- The photos are cut out of her 1366-pixel export, so they are about 430 pixels wide and look soft on a sharp screen. Replace the files in `src/assets/round-4/places` and `src/assets/photos` with the originals, keeping the names
- `tools/round4.py` cuts the new illustration and the photos out of the export

## Versions 6 and 7: Emma's updated design

Her third export is in `reference/round-3`. What changed from round two, and is now in both versions:

- The names are in her serif (Instrument Serif), and "Meet us in Kansas?" sits above the date
- Her photo is on the homepage beside a longer letter
- The schedule is in date order: the welcome party, then the wedding. The welcome party text has a new sentence
- Flight and Getting around are two columns with new wording. The hotels follow
- The FAQ has a new illustration, drops the question about gifts, and adds two questions
- The FAQ comes before Things to Do in the menu
- On a phone, the Menu button stays pinned to the top-right corner while the page scrolls (`pinnedMenu` in `src/App.tsx`)
- The flower beside the open FAQ question is a cosmos (`src/assets/round-3/cosmos.svg`)

Their words are in `src/content/site.ts`. Versions 1 to 5 keep the text they were designed around, in `site-round-2.ts`.

**What version 7 changes from version 6**

| | Version 6 (exact) | Version 7 (recommended) |
| --- | --- | --- |
| Sizing | Everything scales with the window, like a Canva site. Small on a small laptop, large on a big monitor | One type scale. Each size has a floor and a ceiling |
| Small text | Answers, descriptions and hotel notes are about 16px at 1366 wide | 18px to 21px |
| Flight and Getting around | Two columns at different sizes (28px and 25px) that start at different heights | Two matching columns, same size, aligned at the top, with a hairline between |
| Hotels | Names, addresses and notes start at different heights | Rows line up across the three hotels, and the buttons sit on one line |
| Hotel intro | Libre Caslon Text, the only text in that font | Instrument Serif, like the rest of the page |
| Spacing | Each Canva page is a full screen, so there are large gaps | Sections sit closer together, so there is less scrolling |
| Headings | Slightly different letter-spacing on each page | The same on every page |
| Page headings | "Travel" appears twice on the Travel page | Once |

Two things differ from her file in both versions, on purpose:

- **The hotels come after the flight text.** In her file the hotels page is first, but her new wording says "the hotels below". To swap them, reorder the two panels in `Travel` in `src/v6/pages.tsx` and `src/v7/pages.tsx`.
- **"accomadation" is spelled "accommodation"** in the letter. It is respelled from her own handwritten letters by `tools/round3.py`.

`tools/round3.py` cuts her art, handwriting and photo out of the export. `node tools/fit-canva.mjs --round 3` fits version 6 to her screenshots.

## Versions 4 and 5: what follows Emma's notes

| Her note | What v4 and v5 do |
| --- | --- |
| Keep it how I had it, with the scrolling | Each of her Canva pages is a panel at her exact positions. The homepage scrolls from the names to the schedule, as she designed it |
| Keep the exact fonts | The fonts were identified by overlaying candidates on her lettering (see Fonts below). Her handwritten phrases are shown as her own lettering |
| The flowers look low resolution | Her two illustrations are cut from her screenshots again and sharpened four times over |
| No photo placeholders. Maybe one photo | v4 has one photo under "Meet us in Kansas?". v5 has none |
| Travel on one page | Travel and the hotels are one page you scroll |
| The FAQ: click a question to see the answer, with the little flower | The FAQ is her layout as an accordion, and the flower from v2 blooms beside the open question |

Text is also back in her coral everywhere. See Colors below.

### Fonts

| Use | Font | How sure |
| --- | --- | --- |
| Names (round two) | Fahkwang 400 | Sure. It overlaps her lettering 94%. The next best of 1,700 candidates overlaps 70% |
| Names (round three) | Instrument Serif | Sure. 91% overlap. The next best overlaps 52% |
| Flight and Getting around (round three) | Instrument Serif | Sure |
| Date, headings, schedule, lists | Instrument Serif | Sure |
| Travel paragraphs | Libre Caslon Text | Fairly sure. All four of her paragraphs fit it at one size, to within a quarter of a pixel |
| Handwriting ("Meet us in Kansas?", the letter, the day lines, "If you're in town...") | Not found | It is not a Google font. These five phrases are images of her own lettering, so they are exact, but changing their words means a new export from Canva |

The first round used Montserrat, Lustria and Nothing You Could Do for three of these. That is the font change Emma noticed.

**To make the handwriting editable:** ask Emma for the font's name in Canva, or for a PNG of each phrase with a transparent background.

## Change the content

All three versions read the same files in `apps/web/src/content/`.

| File | What it holds |
| --- | --- |
| `site.ts` | Every word: names, date, letter, events, travel, hotels, things to do and FAQ |
| `photos.ts` | The photo slots. This is the one file to edit when the engagement photos arrive |
| `pages.ts` | Page slugs, nav labels and the version list |

### Add the photos

1. Put the images in `apps/web/src/assets/photos/`.
2. In `photos.ts`, set each slot's `src` to the file name (for example `"hero.jpg"`) and write real `alt` text.
3. If a crop is off, change `focal`. It is a CSS `object-position`.

A slot with `src: null`, or whose file is missing, shows a designed placeholder.

v4, v6 and v7 use only the first slot (`heroPhoto`). v5 uses none.

The photo there now (`src/assets/photos/emma-eric.jpg`) is cut out of Emma's Canva export, so it is only 645 by 468 pixels and looks soft on a sharp screen. Replace the file with the original photo, keeping the name.

**Photos of Emma and Eric are not in git yet.** This repository is public, so `.gitignore` keeps these on this machine only:

- `src/assets/photos/`: the homepage photo and the one at Cowtown
- `reference/round-3/home.png` and `reference/round-4/things.png`: her exports that contain them

Until they are committed, the deployed site shows a placeholder where each of those photos goes, and `tools/round3.py`, `tools/round4.py` and `fit-canva.mjs --round 3` need local copies of the exports. To publish the photos, delete those three lines from `.gitignore` and commit the files. Photos of places have no people in them and are committed.

### Things still to decide

- **Hotel booking links.** Set `bookingUrl` for each hotel in `site.ts`. Until then the button says the link is coming soon.
- **Welcome party venue.** The venue (Elderslie) is stored but hidden, because the Canva copy says the details come later. Set `venueAnnounced: true` to show it. Confirm the venue name and address first. They came from a web search.
- **Rehearsal dinner.** It is stored with `guestFacing: false`, so guests do not see it.

## Colors and contrast

Emma's coral on the cream background is 2.7:1, which is too faint for reading text. Text therefore has three steps, set in `apps/web/src/shared/base.css`:

| Token | Used for | Contrast on cream |
| --- | --- | --- |
| `--coral-display` | Type of 40px and up. Emma's coral, unchanged | 2.7:1 |
| `--coral-title` | Type from 24px to 40px | 3.5:1 |
| `--coral-text` | Everything smaller | 4.6:1 |

The display step is the one place that does not meet WCAG AA (large text needs 3:1). To meet it, set `--coral-display` to `var(--coral-title)`. To match the Canva palette exactly, set all three to `var(--coral)`.

Those three steps apply to versions 1 to 3. **Versions 4 and 5 use Emma's coral (`#F16E50`) for every word, as she designed it.** That means small text there is 2.6:1 against the cream, below the 4.5:1 guideline, so it is harder to read for people with low vision or on a phone in sunlight. It is one line to change (`--ink` in `src/v4/v4.css`) if she agrees to a deeper coral for small text.

## Illustrations

- The cosmos bouquet and the lily arrangement are Emma's own Canva art. They are cut out of the reference images, upscaled four times with Real-ESRGAN and cleaned up with `tools/enhance.py`. Her screenshots are only 1366 pixels wide, so this is as sharp as they can get. For a perfect result, ask Emma to export the two illustrations from Canva as PNGs.
- Her handwritten phrases are cut out the same way with `tools/lettering.py`.
- The other pieces (single stems, spot illustrations, the garland) were generated in her style with `tools/gen-sheets.mjs` and sliced with `tools/slice-sheets.py`. The prompts are in `gen-sheets.mjs`.
- The finished files are in `apps/web/src/assets/art/`. `scratch/` holds working files and is not committed.

## Check it

```sh
pnpm --filter weddingv2-web check   # typecheck, lint and content tests
pnpm --filter weddingv2-web shots   # screenshots of every page at 1440x900, 1366x768 and 390x844
node apps/web/tools/audit.mjs       # text contrast and tap-target audit (run from this folder)
node apps/web/tools/frames.mjs      # the v3 envelope and card animations as stills
node apps/web/tools/fit-canva.mjs --check   # how far each piece of v6 text is from Emma's Canva, in pixels
node apps/web/tools/compare-canva.mjs       # v6 and her Canva, panel by panel, as images
```

The last two take `--round 2` to check versions 4 and 5 against her earlier export.

The screenshot and audit tools need the dev server running. From `apps/web`, `node tools/with-server.mjs` followed by a command starts one for the length of that command. Screenshots go to `scratch/shots/`.

## Layout

```txt
projects/weddingv2/
  alchemy.run.ts   deployment (static assets on Cloudflare)
  PLAN.md          design plan for the three versions
  reference/       Emma's Canva screenshots (the source of truth for v1 and for all text)
  tools/           illustration pipeline
  apps/web/
    src/content/   shared content
    src/shared/    tokens, photo slot, illustration list
    src/v1/ v2/ v3/   the first round
    src/canva/        shared parts for the versions that follow her Canva
    src/v4/           v4 and v5: her second export, with positions in spec.json
    src/v6/           v6: her third export, exactly
    src/v7/           v7: her third export, recommended layout
    src/v8/           v8 and v9: v7 with animation and her fourth export
    test/          content tests
    tools/         screenshot, audit and animation-frame tools
```
