# weddingv2 handoff

> **Status:** the three versions are built. Start with `README.md` and `PLAN.md`. This file is the original brief, kept for reference. Since it was written, Eric confirmed that the wedding (ceremony and reception) is at Botanica, and the welcome party and rehearsal dinner are at Elderslie.

Read this file fully before you start. It records the brief, the decisions made so far, and the next steps.

## Brief

- Couple: Emma Starks and Eric Ventor
- Date: Saturday, September 25, 2027
- Ceremony: Botanica, The Wichita Gardens, 701 Amidon St, Wichita, KS 67203
- Other venue: Elderslie Garden (see open questions)
- Vibe: romantic outdoor garden party. The couple are not "outdoorsy." Think garden party, not rustic camping
- Emma designed the site in Canva. Eric's existing site is not the target
- Goal: a design exploration of the landing page and the information guide. Wow them. Make it feel romantic and special
- Emma does not like long-scroll pages. Each section must be a standalone, clickable page
- No RSVP functionality
- Do not look at or reuse anything from `projects/emma-eric-wedding` (the old site). Use the Canva references only
- The engagement photos come later. The landing page must have designed space for photos, with good placeholders that are easy to swap (one config/data file)

## Deliverable: three versions

All three versions use one shared content module, so the text is the same everywhere.

1. **As is**: follow Emma's Canva design closely (palette, type, illustrations, layout). Split it into standalone pages and add tasteful navigation
2. **Riffed**: same palette and type, more creative freedom. Ideas: florals that draw in or sway, petal or page-turn transitions between pages, illustrated schedule timeline, a hotel carousel (Emma explored three-column and one-hotel-per-panel layouts in `Travel.jpeg`), deckled or torn-paper photo frames, paper-grain texture
3. **Super riffed**: a bold reinterpretation of the vibe. One proposal (not decided): an invitation suite laid on a garden-party table. An envelope with a wax seal opens to reveal cards (Schedule, Travel, Things to Do, FAQ, photo polaroids) with pressed flowers. When you click a card, it lifts and grows into a full page. On mobile, the cards become a swipeable deck. You have creative freedom here

Give the site a root index that links to the three versions, for example `/v1`, `/v2` and `/v3`. Each page has its own URL so links can go straight to it.

## Reference images

The images are in `reference/`. Their text is the content source of truth. Transcribe it exactly, and fix only obvious typos (for example, "where you can find grab a coffee").

| File | Content |
| --- | --- |
| `1.jpeg` | Home: names, date, florals, "Meet us in Kansas?", the "Dear family and friends" letter, The Schedule (Saturday wedding 5:00–10:30 PM at Botanica, seated by 4:45 PM, parking), "If you're in town..." Friday Sept 24 welcome party (details TBD) |
| `Travel.jpeg` | Flight (ICT), getting around, rideshare, downtown hotels. Room blocks: Hotel At Old Town, Ambassador Hotel Wichita (Autograph Collection), Hilton Garden Inn. It shows several layout explorations. "Click the button to book" implies booking buttons, but no links exist yet |
| `things to do.jpeg` | Dead Center Vintage, Chisholm Creek Park, Watermark Books, Cowtown, and food lists |
| `FAQ.jpeg` | Eight Q&As: indoor/outdoor, weather, dress code, kids, plus ones, open bar, gifts, getting to Wichita |

Long pages such as FAQ must still feel like one screen. Use an accordion or a contained column, not a long page scroll. On mobile, a short scroll is acceptable.

## Design tokens found so far

- Background: cream, sampled `rgb(246,237,230)` ≈ `#F6EDE6`
- Text: coral, about `#EE6A4F` (sample the reference to confirm)
- Illustration accents: lime green about `#9DBF3E`, mustard/ochre about `#D9B36A`, soft pink
- Fonts (all Google Fonts, matched against the references; specimen in `scratch/font-specimen/fonts-shot.png`):

| Role | Font | Reference use |
| --- | --- | --- |
| Names display | Montserrat 300 (wide tracking) | "EMMA & ERIC" |
| Headings and short text | Instrument Serif | "SEPTEMBER 25, 2027", "THE SCHEDULE", FAQ |
| Script accents | Nothing You Could Do | "Meet us in Kansas?", day labels |
| Long body text | Lustria (option; Instrument Serif at small sizes is also in the reference) | Travel paragraphs |

## Illustrations

- The two Canva florals can be cut out of the references: the cosmos/daisy bouquet in `1.jpeg` (two copies) and the lily/rose arrangement on a log in `FAQ.jpeg` and `things to do.jpeg`. Use a color-to-alpha conversion against the cream background, not a hard color key, because the pastel strokes are faint. numpy is not installed globally, so use a venv or ImageMagick. Source resolution is 1366px wide, so the art may be soft on retina screens. The pencil style hides this well
- New illustrations can be generated with `tools/gen-image.mjs` (OpenRouter). Example:

  ```sh
  node projects/weddingv2/tools/gen-image.mjs google/gemini-3-pro-image out.png "<prompt>" scratch/generated/ref-home.jpg scratch/generated/ref-faq.jpg
  ```

  - Key: `OPENROUTER_API_KEY`, or else `~/.pi/agent/auth.json` (the key resolves through `pass`)
  - Cost: about $0.14 per image with `google/gemini-3-pro-image`
  - Test result: `scratch/generated/test-sunflower.png`. Quality is good, but the art is more polished and filled-in than Emma's loose, sparse, scribbly strokes. Ask for "looser, sparser, scribbled strokes, more negative space, unfinished edges"
  - Request a plain cream background, then apply color-to-alpha
  - Ideas: single stems for nav icons or bullets, corner sprigs, Kansas sunflowers, champagne coupes, a small airplane, a hotel facade, a hand-drawn Wichita map, a wax seal, an envelope, scattered petals
- Keep all illustrations in one style. Treat the Canva art as Emma's own design. For a design exploration, using it on the site is acceptable

## Repo rules

- Monorepo root: `templar-labs` (this worktree). Read the root `AGENTS.md` and `projects/README.md`
- Work on `main`. Commit and push to `origin/main`. Use conventional commits (commitlint runs as a hook)
- Pre-commit hooks run biome, oxlint and the monorepo check
- Every workspace `package.json` needs `build`, `check`, `lint`, `test` and `typecheck` scripts, and `private: true`. Apps under `projects/*/apps/*` also need a `deploy` script. Use a no-op that prints a message, because this exploration is not deployed
- Tests go in the workspace `test/` directory, never next to the source files
- Suggested layout: `projects/weddingv2/package.json` plus `projects/weddingv2/apps/web/` (Vite + React + TypeScript, react-router, Motion for transitions, self-hosted fonts through Fontsource). Static only: no Cloudflare, Alchemy or database
- Look at `projects/hello-world` for package conventions only
- Decide if `scratch/` belongs in git. You can probably add it to `.gitignore`

## Process

1. Write `projects/weddingv2/PLAN.md` with the stack, routes, shared content model, version concepts, motion principles and the asset list
2. Prepare the assets: cut out the Canva florals and generate the extra illustrations
3. Build v1, then v2, then v3
4. Review your own work in a real browser with screenshots at desktop (1440×900, 1366×768) and mobile (390×844). Compare v1 against the references side by side. Iterate until it looks excellent. Check transitions, `prefers-reduced-motion`, focus states, tap targets and contrast (coral on cream can fail contrast at small sizes)
5. Commit, push, and give Eric the local dev URL and a short summary of each version. Do not deploy

## Open questions for Eric

- Venues: the Canva schedule lists "The Wedding 5:00–10:30 PM" at Botanica, and the FAQ says dinner is indoors. This suggests the reception is at Botanica. But Eric said the reception and welcome party are at Elderslie Garden. Confirm which events are where before you finalize the Schedule. Until then, put the venue for each event in the content module so it is easy to change. Confirm the exact name and address of "Elderslie" before you use it
- Hotel booking links: none yet. Use placeholder buttons
- How many photo slots on the landing page? Default: three or four placeholders, one of them a hero
