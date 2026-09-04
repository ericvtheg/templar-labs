# Little Chaos

32,000 particles become Saturn, a galaxy, a bloom, a double helix, or your own words. Hold to scatter; release to rebuild.

## Run

```sh
pnpm install
pnpm dev little-chaos
```

Open http://localhost:5186. The app runs entirely in the browser with TypeScript and WebGL; no account, API key, or backend required.

## Play and share

- Hold the canvas or focus it and hold Space to scatter the sculpture
- Choose a form, one of four palettes, and motion intensity
- Select **Your word** to sculpt up to 12 characters
- **Take a trip** cycles through the forms every three seconds
- **Hide UI** centers the sculpture; Escape brings the controls back
- **Save image** downloads a branded 1200 × 1200 PNG
- **Record 8s** downloads a square scatter-and-rebuild clip, preferring MP4 when the browser supports it and falling back to WebM
- **Share your universe** shares or copies a URL preserving the form, palette, intensity, and word

Animation starts paused for reduced-motion preferences. Video recording stops if the tab is hidden. All scene and text processing stays on the device. Google Fonts supplies the interface fonts, with local system fallbacks.

## Validate

```sh
pnpm --filter little-chaos-web check
pnpm --filter little-chaos-web exec playwright install chromium
pnpm --filter little-chaos-web test:e2e
pnpm --filter little-chaos build
```

Unit tests cover bounded particle geometry and URL state. Browser tests cover desktop and mobile rendering, personalization, scatter/reassembly, pause, reduced motion, focus mode, real PNG/video downloads, and the WebGL fallback.

## Deploy

Pushing to `main` runs the repository deployment workflow. Alchemy provisions the static Vite app at `little-chaos.ericventor.com` using the existing Templar Labs Cloudflare configuration.

## Suggested post

> I asked Codex to make something worth staring at.
>
> It gave me 32,000 particles that turn into a tiny universe.
>
> Hold to break it. Let go to bring it back.
>
> You can even turn your name into one.
>
> little-chaos.ericventor.com

Attach an exported clip. The preview card is generated from the actual app in `apps/web/public/social.jpg`.
