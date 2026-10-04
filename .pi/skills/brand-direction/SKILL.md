---
name: brand-direction
description: Create a distinct product-specific brand guideline before building its UI. Use this explicit command with a product idea to explore seeded visual directions, select an appropriate identity, and carry it through production implementation.
disable-model-invocation: true
compatibility: Node.js 24+ for the bundled generator
---

# Brand direction

Create a brand for this product, not another skin on the last app. Use bounded randomness to explore; use the product brief to decide. Keep the chosen identity stable across implementation and subsequent sessions.

Read `references/method.md` before generating directions. Resolve bundled script paths relative to this skill directory.

## Invoke

```text
/skill:brand-direction <product idea, audience, constraints; optionally ask to build it>
```

A brand-only request creates the guideline, not a mock app. If the user also asks to build the product, establish the guideline first, then implement the real end-to-end workflow. Do not introduce demo customer data to show off the brand.

## 1. Establish the brief

- Identify the audience, job to be done, category, positioning, desired emotional response, and three personality traits
- Record must-haves, prohibited styles, accessibility needs, supplied references, existing identity, and technical constraints
- Infer low-risk details from the idea; ask only when an unresolved choice changes the product or brand materially
- Research 2–3 relevant public references and the category's dominant visual conventions. Cite sources and identify what to differentiate; do not copy logos or exact layouts
- Do not send private product details or customer documents to external research services

If this product already has `brand/BRAND.md` and `brand/identity.json`, reuse them unless the user requests a rebrand or reroll. A bug fix is not permission to randomize the brand again. Honor an explicitly requested family resemblance to an existing product.

## 2. Audit and explore

Inspect the nearest existing products' brand artifacts, fonts, CSS, and rendered screens. Name the repeated design choices to avoid. Compare the actual visuals, not just product names or fingerprints.

Generate three candidates with a fresh seed for a new product:

```sh
node <skill-dir>/scripts/generate.mjs --product "<product name>"
```

Use `--seed <saved seed>` to reproduce candidates, `--mode light|dark` for a constraint, and repeated `--avoid <path/to/brand/identity.json>` arguments for nearby existing brands. Save exploration output outside the project, not as production data.

The generator varies palette, surfaces, font pairing, geometry, composition, density, graphics, and motion. Candidates differ in at least three non-color dimensions; `--avoid` applies that same gate to stored identities. This is a catalog-based exploration aid, not an automated judgment of brand fit or a guarantee of visual uniqueness.

For brands without identity files, manually record the comparison in the guideline. Do not silently ignore them. In this repo, specifically avoid repeating the cream/green, editorial-serif-plus-sans, rounded sidebar-dashboard combination shared by Confer and Offscroll unless requested.

## 3. Select deliberately

- Turn each candidate into a named visual territory with a product-specific rationale and a distinct silhouette, not generic adjectives
- Reject directions that undermine the audience, reading task, workflow, supplied constraints, or accessibility
- Choose the strongest fit and explain why; show alternatives briefly. If the user delegated building, continue without requiring an unnecessary separate approval
- Random layout suggestions do not determine information architecture. The actual workflow wins
- Changing only the accent color does not count as a new identity. Compare typography, geometry, composition, density, graphics, and surface treatment
- If modifying a candidate, update its fingerprint to describe the actual design and rerun contrast checks

Do not constrain every product to the same serif, cream canvas, green accent, tiny icons, card grid, or hero layout. Shared components provide behavior, not a mandatory visual identity.

## 4. Write the visual contract

Create these artifacts under the owning product's `brand/` directory. For an unnamed idea without a project, ask for a location rather than inventing an app or modifying another product.

### `BRAND.md`

Keep it concrete enough to implement:

1. **Positioning:** audience, core promise, personality, voice, and visual thesis
2. **Identity:** original wordmark/mark concept, monochrome and small-size behavior, asset plan; do not claim trademark clearance
3. **Colors:** exact semantic role values, approved foreground/background pairs, contrast ratios, and status-color rules
4. **Typography:** display/body faces, fallback stacks, licensing and self-hosting sources, weights, sizes, line heights, and hierarchy
5. **Visual grammar:** spacing scale, density, grids, navigation, responsive composition, radii, borders, elevation, icons, imagery, and a distinctive graphic motif
6. **Motion:** durations, purposes, easing, and reduced-motion behavior
7. **Real touchpoints:** the primary workflow, honest empty state, form, error, and primary action—not a fake customer dashboard
8. **Differentiation:** nearby brands compared, concrete differences, rejected territory, and do/don't examples
9. **Decision record:** seed, selected direction, justified overrides, references, and validation still needed

### `identity.json`

Persist `{ "version": 1, "product": "<name>", "seed": "<seed>", "direction": <one selected direction object> }`. Do not store all rejected candidates here. Preserve its fingerprint for future anti-sameness checks.

### `tokens.css`

```sh
node <skill-dir>/scripts/generate.mjs --check <product>/brand/identity.json
node <skill-dir>/scripts/generate.mjs --css <product>/brand/identity.json
```

Use the emitted CSS as primitives and map them to the owning app's semantic tokens. Extend with documented type, spacing, elevation, motion, and component tokens. Do not globally restyle shared UI or unrelated products. Self-host licensed fonts; verify availability, weights, language coverage, and licenses before installation.

## 5. Build and verify

- Read the guideline before implementing UI; keep it as the visual source of truth
- Apply UI-polish skills inside this identity, not by replacing it with their examples or a familiar house style
- Carry the brand through the actual product states and workflow, not only a landing page
- Compare real desktop/mobile screenshots with the guideline and nearest existing brands. If it still looks like a recolor, fix the composition and visual grammar
- Verify final rendered contrast, focus visibility, color-independent status cues, typography, keyboard use, and reduced motion. The generator checks specific opaque sRGB color pairs, not full WCAG compliance
- Follow the repository's production-delivery acceptance criteria. Brand work does not justify mocked integrations, scope cuts, or placeholders for requested capabilities

Finish with the guideline path, chosen direction and seed, what makes it distinct, and any unverified decisions. Reroll only when requested or when all candidates fail the brief; retain the final seed and explain rejected directions.
