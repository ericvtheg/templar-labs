# Afterglow

A browser music-visual studio with directed show profiles, animated artist lettering, 3D laser banks, and full-track video export.

## Run

From the repository root, with Node 24 and pnpm 11:

```sh
pnpm install
pnpm dev web-visualizer
```

Open [localhost:5184](http://localhost:5184). Choose a track, drop a file onto the upload area, or try **Voltage / 128**, the original 128 BPM EDM demo. Playback starts after analysis. Space toggles playback; chapter buttons and the waveform seek through the track.

## Experience

| Profile | Worlds | Direction |
| --- | --- | --- |
| Excision-inspired | Sentinel, Ravager, Dreadnought | Articulated machines and creatures; reach, grip, roar, bank, and recovery clips |
| Abstract | Laser cathedral, Hyperspace, Prism riot | Fast geometric rigs, flight through tunnels, mirrored shards, and wide laser fans |
| Prydz-inspired | Leviathan, Chronosphere, Monument | Holographic lifeforms, orbiting structures, architectural scale, and restrained camera travel |
| deadmau5-inspired | The construct, Disassembly, Infinite grid | Rotating LED surfaces, separating panels, voxel chases, and type mapped onto the structure |

These are original procedural interpretations, not official artist assets or replicas of their tour productions. Direction references: [Ryan Talbot’s Excision Nexus animations](https://www.ryantalbot.com/excision-nexus-tour), [Matt King’s HOLO work](https://www.matt-king.com/eric-prydz), and [deadmau5’s Cube history](https://timeline.deadmau5.com/).

- Artist names assemble from slices, move through perspective, break apart between cues, and return for the finale
- Primary, secondary, and accent color pickers control emitters, surfaces, lettering, and effects; Neon, Ultraviolet, and Acid remain available as presets
- A profile loads its worlds, starting colors, impact, and motion settings; controls remain editable
- Authored action clips follow an eight-kick phrase, with anticipation, action, hold, and recovery sampled directly from audio time
- Laser beams originate from moving fixtures in 3D space, spread through simulated haze, and occlude against procedural subjects
- Auto director changes worlds every 16 kicks; choosing a world manually locks it
- Five journey chapters, impact/velocity controls, optional flashes and grain, live audio meters, fullscreen, and three aspect ratios
- Local MP3/WAV processing; 150 MB and 30-minute limits

### Your animation

Import an MP4, WebM, or browser-supported MOV under 500 MB to use rendered CGI or a VJ loop. The clip replaces the procedural subject and background while retaining the selected profile’s lighting and animated identity. Footage loops against the audio clock, follows seeks, and freezes when paused. Clip audio is muted. Portrait and square outputs crop the source to fill the frame. Remove the clip or choose a world/profile to return to procedural scenes.

Imported footage is composited with foreground laser effects; it has no depth map for subject occlusion. Use authored footage when the production requires detailed textured characters or bespoke cinematic animation.

The filter bank uses the decoded sample rate and measures energy every 10 ms. Separate onset envelopes have short decays, keeping drum attacks sharp. Features are precomputed against the audio clock, so seeking and exporting reproduce the same light cues; pausing holds the frame. BPM is an estimate and only appears when kick intervals are sufficiently consistent.

Reduced-motion preferences damp motion and transients, disable flashes, and stop beat-count camera cuts. WebGL and Web Audio support are required. The interface loads fonts from Google Fonts with system fallbacks.

## Export

**Export film** records the entire track from the beginning and downloads a video with audio. Export uses 1920×1080, 1080×1920, or 1080×1080, targeting 30 fps. Rendering takes the track’s duration; keep the tab visible. Actual frame rate depends on device performance.

The browser selects WebM (VP9/VP8 + Opus) or MP4 according to its recording support. Export captures the selected world or footage, animated artist name, and lighting without the studio interface. Playback volume affects monitoring only; the exported audio keeps its original level. Cancellation preserves the track and settings.

Audio buffers and the completed video are held in memory. Long tracks require more memory. Tracks, footage, and settings are not persisted after a reload.

## Validate

```sh
pnpm --filter web-visualizer check
pnpm --filter web-visualizer build
pnpm --filter web-visualizer-web exec playwright install chromium
pnpm --filter web-visualizer-web test:e2e
```

Tests live in `apps/web/test/`. Audio tests cover onset timing across sample rates, quiet masters, stereo phase inversion, tempo, silence, repeatable seeking, and the demo's drops and breakdown. Browser tests compare rendered impacts at fixed time and loudness, verify artist lettering and custom colors in all aspect ratios, and cover pause, reduced motion, mobile layout, MP3/WAV import, footage, export, and cancellation. Headless Chromium uses its software GPU. The MP3 fixture is an original generated sine tone; demo audio is synthesized locally. The animation fixture is an original FFmpeg test pattern.

## Deploy

`pnpm --filter web-visualizer deploy` uses the repository’s Alchemy profile to deploy the static Vite app to Cloudflare. No database or backend is required.

Hosted at [web-visualizer.ericventor.com](https://web-visualizer.ericventor.com). The Workers subdomain is disabled.
