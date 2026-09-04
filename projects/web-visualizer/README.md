# Afterglow

A browser EDM lightshow with drum-driven lasers, camera punches, shockwaves, and drop impacts.

## Run

From the repository root, with Node 24 and pnpm 11:

```sh
pnpm install
pnpm dev web-visualizer
```

Open [localhost:5184](http://localhost:5184). Choose a track, drop a file onto the upload area, or try **Voltage / 128**, the original 128 BPM EDM demo. Playback starts after analysis. Space toggles playback; chapter buttons and the waveform seek through the track.

## Experience

- Three WebGL rigs: Mainstage laser banks, Hyperspace gates, and Prism riot shards
- Kick-triggered camera punches and shockwaves, mid-transient snare sweeps, and high-frequency light trails
- Pattern and palette changes counted from detected kicks; larger impacts when drums return or sustained energy jumps
- Auto director switches rigs every 16 detected kicks; selecting a rig manually locks it until auto mode is enabled again
- Five journey chapters, with Overdrive placed around a sustained energy peak
- Neon, Ultraviolet, and Acid palettes; impact, velocity, film grain, fullscreen, and three aspect ratios
- Optional impact flashes and live kick/snare/high response meters
- Stereo waveform analysis, playback volume, pause, seek, restart, and track replacement
- Local processing: audio is never sent to a server; limits are 150 MB and 30 minutes

The filter bank uses the decoded sample rate and measures energy every 10 ms. Separate onset envelopes have short decays, keeping drum attacks sharp. Features are precomputed against the audio clock, so seeking and exporting reproduce the same light cues; pausing holds the frame. BPM is an estimate and only appears when kick intervals are sufficiently consistent.

Reduced-motion preferences damp motion and transients, disable flashes, and stop beat-count camera cuts. WebGL and Web Audio support are required. The interface loads fonts from Google Fonts with system fallbacks.

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

Tests live in `apps/web/test/`. Audio tests cover onset timing across sample rates, quiet masters, stereo phase inversion, tempo, silence, repeatable seeking, and the demo's drops and breakdown. Browser tests compare rendered impacts at a fixed time and level, verify pause and reduced-motion behavior, and cover mobile layout, MP3/WAV import, playback, export, and cancellation. Headless Chromium uses its software GPU. The MP3 fixture is an original generated sine tone; demo audio is synthesized locally.

## Deploy

`pnpm --filter web-visualizer deploy` uses the repository’s Alchemy profile to deploy the static Vite app to Cloudflare. No database or backend is required.
