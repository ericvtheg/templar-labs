# Research and method

## Bounded variation, then a stable identity

[Pentagram's MIT Media Lab identity](https://www.pentagram.com/work/mit-media-lab) uses a shared seven-by-seven grid to create a fixed master mark and related research-group identities. The lesson is controlled variation with a coherent system, not randomizing every screen. Do not copy its marks.

For independent products here, vary the underlying visual territory, not just accents on the same layout. Generate options once per new brand; select against audience and workflow, then freeze the result. A supplied brand takes priority over randomness.

The bundled generator combines curated hue anchors, surface systems, font pairings, corner treatments, composition prompts, density, graphics, and motion. A SHA-256-derived selector makes a saved product/seed reproducible. A new invocation without a seed uses cryptographic entropy. Nearby identities and candidates must differ in at least three non-color fingerprint dimensions.

This is finite, catalog-based exploration. Fingerprint distance measures declared choices, not rendered resemblance. Agents must still compare actual screens, assess appropriateness, and create the product-specific positioning, voice, mark, motif, and component rules. Do not claim novel trademark ownership or automated aesthetic judgment.

## Role-based color, not arbitrary combinations

[Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/) distinguishes typed values and aliases. Use its semantic-role principle: components reference actions, text, surfaces, and feedback roles rather than scattered raw color literals. The helper's CSS and identity JSON are not presented as DTCG-conformant interchange files.

Each generated palette includes canvas, surface, text, muted text, border, primary/on-primary, accent/on-accent, focus, danger, success, and warning. Brand hue varies; feedback semantics remain recognizable. Do not use brand accent as an error color merely for consistency.

## Contrast is a gate

- [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): at least 4.5:1 for normal text; 3:1 only for genuinely large text. Thresholds must not be rounded into passing
- [WCAG 2.2 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): meaningful control and graphical information needs at least 3:1 against adjacent colors

The helper uses the specified sRGB relative-luminance formula, verifies text/action/feedback roles at 4.5:1 against canvas and surface, control boundaries/focus at 3:1, and button foreground/fill pairs at 4.5:1. It adjusts brand anchors toward readable variants when needed.

These checks do not cover transparency, gradients, images, hover states, every adjacency, chart series, focus-indicator area, or the finished app. Validate final rendered states separately. Use words, icons, or patterns alongside color for meaning.

## Fonts and graphics

The pairings are starting points, not installed assets. [Fontsource](https://fontsource.org/docs/getting-started/introduction) provides self-hosting guidance; verify each font's license, supported weights, character sets, and package before use. Limit reading/UI type to usable sizes and reserve expressive display styling for appropriate hierarchy.

Original graphics should express the product's actual concept. Do not reuse another product's monogram, generic sparkle mark, stock illustration system, or fake chart simply to fill an empty screen. Brand styling must not override domain-specific output formats or accessibility.

## Validation commands

From the repository root:

```sh
node --test test/brand-direction.test.mjs
node .pi/skills/brand-direction/scripts/generate.mjs --help
```

After changing the skill, run `/reload` in Pi to discover `/skill:brand-direction`. It is explicit-only through `disable-model-invocation: true`; passing a product idea after the command loads the workflow and supplies the request. No external service, dependency installation, or network access is performed by the generator.
