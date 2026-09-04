# Afterglow

A browser music visualizer that turns an MP3 or WAV into a continuous cinematic journey.

## Run

From the repository root, with Node 24 and pnpm 11:

```sh
pnpm install
pnpm dev web-visualizer
```

Open [localhost:5184](http://localhost:5184). Choose a track, drop a file onto the upload area, or try the original synthesized demo. Playback starts after analysis. Space toggles playback; chapter buttons and the waveform seek through the track.

## Experience

- Three procedural WebGL worlds: Event horizon, Tidal bloom, and Neon voyage
- Five chapters, with the ascension positioned around a sustained energy peak
- Live bass and high-frequency response, camera movement, and opening/closing fades
- Three palettes, intensity, motion, film grain, fullscreen, and landscape/portrait/square framing
- Stereo waveform analysis, playback volume, pause, seek, restart, and track replacement
- Local processing: audio is never sent to a server; limits are 150 MB and 30 minutes

Reduced-motion preferences slow the visual motion and reduce the bass response. WebGL and Web Audio support are required. The interface loads fonts from Google Fonts with system fallbacks.

## Export

**Export film** records the entire track from the beginning and downloads a video with audio. Export uses 1920×1080, 1080×1920, or 1080×1080, targeting 30 fps. Rendering takes the track’s duration; keep the tab visible. Actual frame rate depends on device performance.

The browser selects WebM (VP9/VP8 + Opus) or MP4 according to its recording support. Export captures the procedural visuals without the studio interface. Playback volume affects monitoring only; the exported audio keeps its original level. Cancellation preserves the track and settings.

Audio buffers and the completed video are held in memory. Long tracks require more memory. Tracks and settings are not persisted after a reload.

## Validate

```sh
pnpm --filter web-visualizer check
pnpm --filter web-visualizer build
pnpm --filter web-visualizer-web exec playwright install chromium
pnpm --filter web-visualizer-web test:e2e
```

Tests live in `apps/web/test/`. Browser tests cover rendered pixels, mobile layout, controls, MP3/WAV decoding, drag-and-drop, playback, chapter seeking, corrupt-file recovery, real video/audio export, and cancellation. Headless Chromium uses its software GPU. The MP3 fixture is an original generated sine tone; demo audio is synthesized locally.

## Deploy

`pnpm --filter web-visualizer deploy` uses the repository’s Alchemy profile to deploy the static Vite app to Cloudflare. No database or backend is required.
