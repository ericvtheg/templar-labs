# Web DAW

[Open the studio](https://web-daw.ericventor.com). Press **Space** to play Afterglow, then double-click a clip to edit it. No account, uploads, or downloads are needed to start making music.

## Included

- Three editable, eight-track demo sessions: Afterglow, Night Transit, and Soft Focus
- 64 original PCM drum/percussion samples across eight families
- 24 presets across analog, bass, keys, pad, pluck, and FM instruments
- Per-track filter, saturation, tempo-synced delay, convolution reverb, and compression
- Arrangement with draggable, resizable, duplicated, and independent clips
- Piano roll, step sequencer, note length and velocity, swing, metronome, and loop playback
- Computer-keyboard audition and quantized recording
- Mixer with volume, stereo pan, mute, solo, output metering, and a master limiter
- Undo/redo, browser autosave, 12 named local sessions, and compressed session links
- Stereo 44.1 kHz / 16-bit WAV export, including three seconds of effect tails

Each clip edits independently, including duplicated clips. The arrangement supports 24 tracks and up to 64 bars; MIDI patterns span one, two, or four bars with a grid down to 1/32.

## Editing

| Action | Gesture |
| --- | --- |
| Insert a note | Double-click empty piano-roll space, or press **B** for draw mode |
| Select notes | Drag a marquee; Shift-click to add or remove a note |
| Move / copy notes | Drag / Alt-drag |
| Resize notes or clips | Drag the right edge; clips also have a left trim handle |
| Transpose notes | ↑/↓; Shift + ↑/↓ for an octave |
| Move / resize selected notes | ←/→ / Shift + ←/→ |
| Copy, cut, paste, duplicate | ⌘/Ctrl C, X, V, D in the focused editor |
| Delete | Delete or Backspace |
| Undo / redo | ⌘/Ctrl Z / ⌘/Ctrl Shift Z |
| Set a loop | Drag the arrangement loop brace, or select a clip and press ⌘/Ctrl L |
| Switch notes / devices | Shift + Tab |

Click the piano ruler to place the note paste cursor. Click empty arrangement space to place the clip paste cursor. Clips can move between instrument tracks; their notes play through the destination instrument. Drag the divider above the note editor to give the piano roll more space.

## Develop

From the repository root:

```sh
pnpm install
pnpm --filter web-daw-web dev:studio
```

Open `http://127.0.0.1:5183`. This standalone development mode needs no cloud credentials. The standard `pnpm dev web-daw` launcher uses Alchemy.

```sh
pnpm --filter web-daw-web test
pnpm --filter web-daw-web test:e2e
pnpm --filter web-daw-web typecheck
pnpm --filter web-daw-web exec vite build --mode studio
```

Playwright requires Chromium: `pnpm --filter web-daw-web exec playwright install chromium`.

## Audio and storage

Audio runs locally using Web Audio. A lookahead scheduler schedules notes against the audio clock; export renders the same instrument/effect graph in `OfflineAudioContext`. No third-party plugin binaries are loaded. Keep the studio tab active for reliable live scheduling, especially on mobile.

Sessions autosave in this browser's local storage. Clearing site data removes local sessions. Shared links contain a complete session snapshot; they are portable backups and do not update when the source session changes. Incoming snapshots are validated and size-limited. Sharing does not upload audio or create a server-side project.

All included samples are original synthesized recordings, covered by the repository's MIT license. Regenerate them with:

```sh
python3 projects/web-daw/scripts/generate-samples.py
```

No external sample service, paid instrument subscription, or API key is required.

## Deploy

The repository's Deploy workflow checks and deploys this project on pushes to `main`. `alchemy.run.ts` provisions the Cloudflare app and `web-daw.ericventor.com` through `@templar/deploy`.

The infrastructure-free `studio` Vite mode is for local development and tests. Production deployment uses Alchemy's Cloudflare Vite integration.
