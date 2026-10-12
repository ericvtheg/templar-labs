# weddingv2 plan

A design exploration of the landing page and information guide for Emma and Eric's wedding. Three versions share one content module. It is deployed as a static site at `weddingv2.ericventor.com`.

## Stack

- Vite 7, React 19 and TypeScript, in `apps/web`
- `react-router` for routes, so every page has its own URL
- `motion` for page transitions and shared-layout animation
- Fonts self-hosted through Fontsource: Montserrat (variable, set at weight 350), Instrument Serif, Nothing You Could Do, Lustria. Side by side with the Canva panel, Montserrat 300 was too thin for the names
- Plain CSS, one stylesheet per version, scoped under `.v1`, `.v2` and `.v3`
- Static only. No backend, database or analytics. `alchemy.run.ts` deploys the built files to Cloudflare

## Routes

| Path | Page |
| --- | --- |
| `/` | Index that links to the three versions |
| `/v1`, `/v2`, `/v3` | Home (the landing page, with the photos) |
| `/:version/schedule` | The Schedule |
| `/:version/travel` | Travel: getting to and around Wichita |
| `/:version/stay` | Travel: the three hotel room blocks |
| `/:version/things-to-do` | Things to Do |
| `/:version/faq` | Frequently Asked Questions |

Travel is two pages because the Canva design has two "Travel" panels and neither fits one screen with the other.

## Shared content

- `src/content/site.ts` holds every word on the site: couple, date, letter, events, travel, hotels, things to do and FAQ. The Canva references are the source of truth. Typo fixes are listed at the top of the file
- `src/content/photos.ts` is the one file to edit when the engagement photos arrive. Each slot has a `src` (null shows the designed placeholder), `alt` text and a focal point
- `src/content/pages.ts` lists the pages, slugs and nav labels
- Each event carries its own venue, so a venue change is a one-line edit. The welcome party venue (Elderslie) is stored but not shown, because the Canva copy says the details come later. Set `announced: true` to show it. The rehearsal dinner is stored with `guestFacing: false`

## Round three: versions 6 and 7

Emma liked version 4 and sent an updated Canva export (`reference/round-3`) with new wording, a photo and some layout changes. She asked for one version that follows it exactly and one that is my recommendation for type sizes and layout.

- **Version 6** is built like version 4: her pages as panels, every block at a measured position (`src/v6/spec.json`), 38 of 40 blocks within one pixel. The two exceptions are the line with the fixed typo and a two-line intro that is 1.5 pixels short
- **Version 7** uses the same content, fonts, color and art in a normal responsive layout (`src/v7/v7.css`). It has one type scale with a floor and ceiling on every size, two matching columns for Flight and Getting around, hotel rows that line up, and tighter spacing. It does not change her structure or wording
- Both share the FAQ accordion (`src/canva/FaqAccordion.tsx`) and the cosmos marker
- Content is versioned: `site.ts` is round three, `site-round-2.ts` is what versions 1 to 5 were designed around

## Round two: versions 4 and 5

Emma reviewed the first round and wanted her own design back: her scroll, her fonts, no photo placeholders, sharper flowers. Versions 4 and 5 are that. They are one implementation (`src/v4`), and v5 only leaves the photo off the homepage.

- Each of her Canva pages is a panel of 1366 by 768 "panel pixels" that scales with the window, the way a Canva site does. Panels stack, so the page scrolls as her design does
- Every piece of text sits at a position measured from her screenshot. `tools/fit-canva.mjs` overlays the page on her screenshot and corrects each block until the ink lines up. 36 of 37 blocks are within one pixel
- Fonts were identified, not chosen: `tools/font-match.mjs` scores candidates by overlap with her lettering, and `tools/font-layout.mjs` by where the words fall on a line
- Her handwriting font is not a Google font, so those five phrases are images of her own lettering
- Below 960 pixels wide the same content reflows into one column
- The one new element is the navigation, a row of links in her serif above the first panel
- The FAQ is the one page that differs from her Canva on purpose: she asked for click-to-open

## Versions (first round)

### v1: As is

Emma's Canva design, split into pages. Same palette, type, illustrations and layout. Each page is one Canva panel that fits one screen.

- Home: names top left, date below, cosmos bouquet on the right, then "Meet us in Kansas?", the letter and the photos
- Schedule: the wedding and the welcome party side by side
- Travel and Stay: centered Lustria paragraphs, three hotel columns with booking buttons
- Things to Do and FAQ: heading and lily arrangement on the left, ruled list on the right. The FAQ is an accordion, so eight answers fit one screen
- Navigation: a quiet row of links at the top. On mobile, a full-screen menu
- Motion: a soft cross-fade between pages. Nothing else moves

### v2: Riffed

Same palette and type. The garden comes alive.

- Paper-grain texture, deckled photo frames with tape, hand-drawn squiggle under the current nav link
- The bouquet blooms in, then sways. Single stems sway on their own
- Page changes send a few petals across the screen
- Schedule: an illustrated timeline on a vine that draws itself
- Stay: a hotel carousel, one hotel per panel, with swipe and arrow keys
- Things to Do: illustrated cards. FAQ: questions on the left, the chosen answer on a note on the right

### v3: Super riffed

The invitation suite, laid out on a garden-party table in dappled light.

- An envelope with a wax seal opens. The cards slide out and settle on the linen: the invitation, Schedule, Travel, Stay, Things to Do, FAQ and photo polaroids, with pressed flowers between them
- Click a card and it lifts and grows into a full page. Close it and it returns to its place. Each open card has its own URL
- On mobile the cards become a swipeable deck
- The envelope opens once per session. Deep links and reduced motion skip it

## Motion principles

- Motion explains where things come from and go to. It never blocks reading
- Small moves take 150–250 ms. Page changes take 400–600 ms. Intros finish in about a second
- Idle motion (sway, dappled light) is slow and small
- `prefers-reduced-motion` turns off sway, petals, draw-in and the envelope sequence. Page changes become a short fade
- Every interactive element has a visible focus ring and a tap target of at least 44 px

## Color and contrast

- Cream `#F6EDE6` and Emma's coral `#EA6A4C` (sampled from the references)
- Coral on cream is 2.7:1, which is too faint for reading text. Text has three steps: display type of 40px and up keeps Emma's coral, type from 24px to 40px uses `#DC4F35` (3.5:1), and smaller text uses `#BC412A` (4.6:1). Illustrations and rules keep the true coral
- Display type is the one place below WCAG AA (large text needs 3:1). It keeps Emma's coral because it is her brand color and the type is very large. To change either way, edit the three text tokens in `src/shared/base.css`
- `tools/audit.mjs` checks contrast and tap targets on every page

## Assets

| Asset | Source |
| --- | --- |
| Cosmos bouquet | Cut out of `reference/1.jpeg` with `tools/cutout.py` |
| Lily arrangement on a log | Cut out of `reference/things to do.jpeg` |
| Single stems (cosmos, buds, sprig, lily, rose, sunflower) | Generated in Emma's style, `tools/gen-sheets.mjs` |
| Spot illustrations (coupes, airplane, key, suitcase, car, bell, books, dress, boot, deer, plate, cocktail, arch, chair, moon, sun, gift, bow tie) | Generated, then sliced with `tools/slice-sheets.py` |
| Garland and six growing stems | Generated |
| Wax seal, envelope, petals, squiggles, vine, paper grain, dappled light | SVG and CSS |
| Photo placeholders | CSS, driven by `src/content/photos.ts` |

`scratch/` holds working files and is not committed.

## Checks

- Screenshots at 1440×900, 1366×768 and 390×844 with `pnpm --filter weddingv2-web shots`
- v1 compared side by side with the references
- Contrast and tap targets on every page with `tools/audit.mjs`
- Keyboard order, focus rings and reduced motion checked in each version
- The v3 envelope and card animations reviewed as stills with `tools/frames.mjs`
