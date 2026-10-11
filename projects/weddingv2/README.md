# weddingv2

A design exploration for Emma and Eric's wedding website (September 25, 2027, Wichita, Kansas). It covers the landing page and the information guide in three versions. It has no RSVP.

Live at <https://weddingv2.ericventor.com>. The pages ask search engines not to index them.

## Run it

```sh
pnpm --filter weddingv2-web dev
```

Open <http://127.0.0.1:5191>. The root page links to the three versions.

| Path | Version |
| --- | --- |
| `/v1` | **As is.** Emma's Canva design, split into pages |
| `/v2` | **Riffed.** The same palette and type, with swaying florals, petals between pages and paper textures |
| `/v3` | **Super riffed.** The invitation suite, opened on a garden-party table |

Every page has its own URL in every version: `schedule`, `travel`, `stay`, `things-to-do` and `faq`. The small pill in the bottom-right corner opens the same page in another version. It is reviewer chrome, not part of the designs.

## Deploy it

A push to `main` deploys it through the repo's Deploy workflow. `alchemy.run.ts` publishes the built site to Cloudflare as static assets, with a fallback to the app shell so deep links work. To take it down, run `pnpm --filter weddingv2 run destroy` with the `templar-labs` Alchemy profile. (The Destroy project workflow in GitHub only lists some projects, and this is not one of them.)

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

## Illustrations

- The cosmos bouquet and the lily arrangement are Emma's own Canva art, cut out of the reference images with `tools/cutout.py`.
- The other pieces (single stems, spot illustrations, the garland) were generated in her style with `tools/gen-sheets.mjs` and sliced with `tools/slice-sheets.py`. The prompts are in `gen-sheets.mjs`.
- The finished files are in `apps/web/src/assets/art/`. `scratch/` holds working files and is not committed.

## Check it

```sh
pnpm --filter weddingv2-web check   # typecheck, lint and content tests
pnpm --filter weddingv2-web shots   # screenshots of every page at 1440x900, 1366x768 and 390x844
node apps/web/tools/audit.mjs       # text contrast and tap-target audit (run from this folder)
node apps/web/tools/frames.mjs      # the v3 envelope and card animations as stills
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
    src/v1/ v2/ v3/
    test/          content tests
    tools/         screenshot, audit and animation-frame tools
```
