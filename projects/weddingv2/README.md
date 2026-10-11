# weddingv2

A design exploration for Emma and Eric's wedding website (September 25, 2027, Wichita, Kansas). It covers the landing page and the information guide. It has no RSVP.

Emma designed the site in Canva. The first round (versions 1 to 3) reinterpreted her design, and she did not want that. Versions 4 and 5 reproduce her Canva exactly and add only what she asked for.

Live at <https://weddingv2.ericventor.com>. The pages ask search engines not to index them.

## Run it

```sh
pnpm --filter weddingv2-web dev
```

Open <http://127.0.0.1:5191>. The root page links to the three versions.

| Path | Version |
| --- | --- |
| `/v4` | **As Emma made it.** Her Canva, panel for panel, with her scroll. One spot for a photo on the homepage |
| `/v5` | **The same, no photo.** Exactly v4 with nothing added to her homepage |
| `/v1` | **As is.** Emma's Canva design, split into pages |
| `/v2` | **Riffed.** The same palette and type, with swaying florals, petals between pages and paper textures |
| `/v3` | **Super riffed.** The invitation suite, opened on a garden-party table |

Every page has its own URL in every version: `schedule`, `travel`, `stay`, `things-to-do` and `faq`. In v4 and v5 the homepage scrolls down into the schedule, and Travel is one page with the hotels below (`stay` opens it at the hotels). The small pill in the bottom-right corner opens the same page in another version. It is reviewer chrome, not part of the designs.

## Deploy it

A push to `main` deploys it through the repo's Deploy workflow. `alchemy.run.ts` publishes the built site to Cloudflare as static assets, with a fallback to the app shell so deep links work. To take it down, run `pnpm --filter weddingv2 run destroy` with the `templar-labs` Alchemy profile. (The Destroy project workflow in GitHub only lists some projects, and this is not one of them.)

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
| Names | Fahkwang 400 | Sure. It overlaps her lettering 94%. The next best of 1,700 candidates overlaps 70% |
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

1. Put the images in `apps/web/public/photos/`.
2. In `photos.ts`, set each slot's `src` (for example `"/photos/hero.jpg"`) and write real `alt` text.
3. If a crop is off, change `focal`. It is a CSS `object-position`.

A slot with `src: null` shows a designed placeholder.

v4 uses only the first slot (`heroPhoto`), and shows the picture whole, in its own shape. v5 uses none.

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
node apps/web/tools/fit-canva.mjs --check   # how far each piece of v4 text is from Emma's Canva, in pixels
node apps/web/tools/compare-canva.mjs       # v5 and her Canva, panel by panel, as images
```

The screenshot and audit tools need the dev server running. Screenshots go to `scratch/shots/`.

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
    src/v4/           v4 and v5: her Canva, with positions in spec.json
    test/          content tests
    tools/         screenshot, audit and animation-frame tools
```
