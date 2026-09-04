import { expect, test } from "@playwright/test";

function wav(seconds = 4): Buffer {
  const rate = 16000;
  const length = rate * seconds;
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((i / rate) * 220 * Math.PI * 2) * 8000), 44 + i * 2);
  }
  return buffer;
}

test("renders a living preview and supports visual controls on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your track. The whole mainstage." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export film" })).toBeDisabled();
  await expect(page.locator(".visual-error")).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
          const gl = canvas.getContext("webgl");
          if (!gl) {
            return 0;
          }
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let bright = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if ((pixels[i] ?? 0) > 40) {
              bright++;
            }
          }
          return bright;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(1000);
  await page.screenshot({ path: "test/results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Ravager/ }).click();
  await expect(page.getByRole("button", { name: /Ravager/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".stage-caption h2")).toHaveText("Ravager.");
  await page.getByRole("button", { name: "Acid", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Film grain" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("switch", { name: "Film grain" }).click();
  await expect(page.getByRole("switch", { name: "Film grain" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByLabel("Aspect ratio").selectOption("1");
  await expect(page.locator(".stage-shell")).toHaveClass(/portrait/);
  await page.getByLabel("Aspect ratio").selectOption("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Choose a track" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test/results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("decodes uploads, plays, pauses, seeks through chapters, and recovers from bad files", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles({ name: "Journey.wav", mimeType: "audio/wav", buffer: wav(20) });
  await expect(page.locator(".track-title strong")).toHaveText("Journey");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.getByRole("slider", { name: "Track position" }).inputValue();
  await page.waitForTimeout(400);
  expect(await page.getByRole("slider", { name: "Track position" }).inputValue()).toBe(paused);
  await page.getByRole("button", { name: /05.*Finale/ }).click();
  await expect(page.locator(".stage-caption h2")).toHaveText("Finale.");
  expect(
    Number(await page.getByRole("slider", { name: "Track position" }).inputValue()),
  ).toBeCloseTo(17.6, 1);
  await page.getByRole("button", { name: "Restart track" }).click();
  await expect(page.getByRole("slider", { name: "Track position" })).toHaveValue("0");
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles({
    name: "broken.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("not audio"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(page.locator(".track-title strong")).toHaveText("Journey");
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles({ name: "Replacement.WAV", mimeType: "audio/wav", buffer: wav(2) });
  await expect(page.locator(".track-title strong")).toHaveText("Replacement");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.locator(".stage-caption h2")).toHaveText("Finale.");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("exports a full film with video and audio tracks", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles({ name: "Export.wav", mimeType: "audio/wav", buffer: wav(3) });
  await expect(page.locator(".track-title strong")).toHaveText("Export");
  await page.getByLabel("Artist name", { exact: true }).fill("NIGHT PROTOCOL");
  await page.getByRole("button", { name: "Export film" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".export-summary")).toContainText("NIGHT PROTOCOL");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Render film" }).click();
  await expect(page.locator(".export-progress")).toContainText("Rendering your journey");
  await expect(page.getByLabel("Aspect ratio")).toBeDisabled();
  await expect(page.getByLabel("Artist name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Primary color")).toBeDisabled();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/Export-afterglow\.(webm|mp4)$/);
  const destination = "test/results/export.webm";
  await download.saveAs(destination);
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(destination);
  expect(bytes.length).toBeGreaterThan(10000);
  // WebM's codec identifiers confirm that the actual file contains both streams.
  expect(bytes.includes(Buffer.from("V_VP"))).toBe(true);
  expect(bytes.includes(Buffer.from("A_OPUS"))).toBe(true);
  await expect(page.locator(".toast")).toContainText("Your film is ready");
});

test("the synthesized demo starts without a file or network audio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo track" }).click();
  await expect(page.locator(".track-title strong")).toHaveText("Voltage / 128");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("decodes a real MP3 and accepts a dropped WAV without uploading audio", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") {
      posts.push(request.url());
    }
  });
  await page.goto("/");
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles("test/fixtures/tone.mp3");
  await expect(page.locator(".track-title strong")).toHaveText("tone");
  await expect(page.locator(".track-title")).toContainText("MP3");
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "Dropped.wav", { type: "audio/wav" }));
      return data;
    },
    Array.from(wav(4)),
  );
  await page
    .getByRole("region", { name: "Upload audio", exact: true })
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".track-title strong")).toHaveText("Dropped");
  await transfer.dispose();
  expect(posts).toEqual([]);
});

test("cancelling a render preserves the track and unlocks the studio", async ({ page }) => {
  const downloads: string[] = [];
  const errors: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles({ name: "Keep.wav", mimeType: "audio/wav", buffer: wav(20) });
  await expect(page.locator(".track-title strong")).toHaveText("Keep");
  await page.getByRole("button", { name: "Export film" }).click();
  await page.getByRole("button", { name: "Render film" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".export-progress")).toHaveCount(0);
  await expect(page.getByLabel("Aspect ratio")).toBeEnabled();
  await expect(page.locator(".track-title strong")).toHaveText("Keep");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
});

test("a detected kick visibly punches every rig at the same time and loudness", async ({
  page,
}) => {
  await page.goto("/");
  const measurements = await page.evaluate(async () => {
    const visualPath = "/src/visualizer.ts";
    const rhythmPath = "/src/rhythm.ts";
    const { Visualizer } = await import(visualPath);
    const { analyzeRhythm, sampleRhythm } = await import(rhythmPath);
    const pcm = Float32Array.from({ length: 22050 }, (_, i) => {
      const phase = i / 22050 - 0.25;
      return phase >= 0 ? Math.sin(phase * 65 * Math.PI * 2) * Math.exp(-phase * 26) * 0.8 : 0;
    });
    const response = sampleRhythm(analyzeRhythm([pcm], 22050), 0.27);
    const canvas = document.createElement("canvas");
    canvas.style.width = "384px";
    canvas.style.height = "216px";
    document.body.append(canvas);
    const visualizer = new Visualizer(canvas);
    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL is unavailable");
    }
    const capture = () => {
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const results = [];
    for (let scene = 0; scene < 3; scene++) {
      const frame = {
        ...response,
        snare: 0,
        drop: 0,
        time: 2.7,
        progress: 0.4,
        scene,
        palette: 0,
        intensity: 0.9,
        motion: 0.85,
        grain: false,
        flash: false,
        loaded: true,
      };
      visualizer.render({ ...frame, kick: 0, snare: 0, drop: 0 }, 16 / 9);
      const steady = capture();
      visualizer.render(frame, 16 / 9);
      const impact = capture();
      let before = 0;
      let after = 0;
      let changed = 0;
      for (let i = 0; i < steady.length; i += 4) {
        const a = (steady[i] ?? 0) + (steady[i + 1] ?? 0) + (steady[i + 2] ?? 0);
        const b = (impact[i] ?? 0) + (impact[i + 1] ?? 0) + (impact[i + 2] ?? 0);
        before += a;
        after += b;
        if (Math.abs(a - b) > 45) {
          changed++;
        }
      }
      results.push({
        scene,
        brightnessRatio: after / Math.max(1, before),
        changedFraction: changed / (steady.length / 4),
      });
    }
    visualizer.dispose();
    canvas.remove();
    return results;
  });
  for (const measurement of measurements) {
    expect(measurement.brightnessRatio, JSON.stringify(measurement)).toBeGreaterThan(1.35);
    expect(measurement.changedFraction, JSON.stringify(measurement)).toBeGreaterThan(0.15);
  }
});

test("pausing holds the lighting frame and reduced motion disables impact flashes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo track" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(200);
  const before = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(350);
  const after = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(after).toBe(before);
  await page.getByRole("button", { name: /02.*Lift-off/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "Ravager audio-reactive visual",
  );
  await page.getByRole("button", { name: /Sentinel MECH/ }).click();
  await expect(page.getByRole("switch", { name: "Auto director" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("button", { name: /03.*Warp/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "Sentinel audio-reactive visual",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("switch", { name: "Impact flashes" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.getByRole("switch", { name: "Impact flashes" })).toBeDisabled();
});

test("artist lettering and custom colors reach the canvas in every export shape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo track" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: /02.*Lift-off/ }).click();
  await page.getByLabel("Artist name", { exact: true }).fill("NEON AFTER HOURS");
  await expect(page.getByLabel("Artist name", { exact: true })).toHaveValue("NEON AFTER HOURS");
  await page.getByLabel("Primary color").fill("#ff3300");
  await page.getByLabel("Secondary color").fill("#aa1100");
  await page.getByLabel("Accent color").fill("#ffbb66");
  await expect(page.locator(".color-section .section-heading")).toContainText("Custom");
  await page.getByRole("button", { name: "Acid", exact: true }).click();
  await expect(page.getByLabel("Primary color")).toHaveValue("#b8ff24");
  await expect(page.getByLabel("Secondary color")).toHaveValue("#00dcb4");
  await expect(page.getByLabel("Accent color")).toHaveValue("#f4ffd9");
  const results = await page.evaluate(async () => {
    const visualizerPath = "/src/visualizer.ts";
    const { Visualizer } = await import(/* @vite-ignore */ visualizerPath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "320px";
    document.body.append(canvas);
    const renderer = new Visualizer(canvas);
    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL unavailable");
    }
    const capture = () => {
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const frame = {
      time: 2,
      progress: 0.5,
      bass: 0.6,
      mid: 0.5,
      high: 0.4,
      level: 0.8,
      kick: 0,
      snare: 0,
      drop: 0,
      build: 0,
      drive: 2,
      beat: 4,
      scene: 0,
      palette: 0,
      intensity: 0.9,
      motion: 0.85,
      grain: false,
      flash: false,
      loaded: true,
    };
    const output = [];
    for (const ratio of [16 / 9, 9 / 16, 1]) {
      renderer.render(frame, ratio);
      const blank = capture();
      renderer.render({ ...frame, artist: "NEON AFTER HOURS" }, ratio);
      const titled = capture();
      // Inspect the unobstructed foreground lockup, which is part of the encoded canvas.
      let textPixels = 0;
      for (let y = Math.floor(canvas.height * 0.1); y < canvas.height * 0.9; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if ((titled[i] ?? 0) - (blank[i] ?? 0) > 30) {
            textPixels++;
          }
        }
      }
      renderer.render({ ...frame, colors: ["#ff0000", "#ff0000", "#ff0000"] }, ratio);
      const red = capture();
      renderer.render({ ...frame, colors: ["#00ff00", "#00ff00", "#00ff00"] }, ratio);
      const green = capture();
      let redTotal = 0;
      let greenTotal = 0;
      let redWrong = 0;
      let greenWrong = 0;
      for (let i = 0; i < red.length; i += 4) {
        redTotal += red[i] ?? 0;
        redWrong += red[i + 1] ?? 0;
        greenTotal += green[i + 1] ?? 0;
        greenWrong += green[i] ?? 0;
      }
      output.push({
        ratio,
        textPixels,
        redRatio: redTotal / Math.max(1, redWrong),
        greenRatio: greenTotal / Math.max(1, greenWrong),
      });
    }
    renderer.dispose();
    canvas.remove();
    return output;
  });
  for (const result of results) {
    expect(result.textPixels, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.redRatio).toBeGreaterThan(2);
    expect(result.greenRatio).toBeGreaterThan(2);
  }
  await page.getByLabel("Artist name", { exact: true }).fill("ÅSTRAL 夜間 / LIVE");
  await expect(page.getByLabel("Artist name", { exact: true })).toHaveValue("ÅSTRAL 夜間 / LIVE");
  await page.getByLabel("Artist name", { exact: true }).fill("");
  await expect(page.locator(".visual-error")).toHaveCount(0);
});

test("animation footage stays local, pauses, survives invalid replacements, and exports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Upload animation").setInputFiles("test/fixtures/animation.mp4");
  await expect(page.locator(".footage-file")).toContainText("animation.mp4");
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles({ name: "Film.wav", mimeType: "audio/wav", buffer: wav(4) });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: /02.*Lift-off/ }).click();
  let first = "";
  await expect
    .poll(
      async () => {
        const next = await page
          .locator("canvas")
          .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
        const stable = next === first;
        first = next;
        return stable;
      },
      { timeout: 5000, intervals: [150] },
    )
    .toBe(true);
  await page.waitForTimeout(400);
  const second = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(second === first, "Paused footage must hold the decoded video frame").toBe(true);
  await page
    .getByLabel("Upload animation")
    .setInputFiles({ name: "bad.mp4", mimeType: "video/mp4", buffer: Buffer.from("not a video") });
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await expect(page.locator(".footage-file")).toContainText("animation.mp4");
  await page.getByLabel("Artist name", { exact: true }).fill("AFTER HOURS");
  await page.getByRole("button", { name: "Export film" }).click();
  await expect(page.locator(".export-summary")).toContainText("animation.mp4");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Render film" }).click();
  const download = await downloadPromise;
  await download.saveAs("test/results/footage-export.webm");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile("test/results/footage-export.webm");
  expect(bytes.includes(Buffer.from("V_VP"))).toBe(true);
  expect(bytes.includes(Buffer.from("A_OPUS"))).toBe(true);
  expect(bytes.length).toBeGreaterThan(10000);
  await page.getByRole("button", { name: "Remove animation" }).click();
  await expect(page.locator(".footage-file")).toHaveCount(0);
  await expect(page.locator(".visual-error")).toHaveCount(0);
});

test("profiles change worlds and render distinct geometry, while identity has its own animation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Artist name", { exact: true }).fill("LIVE SIGNAL");
  await page.getByRole("button", { name: "Eric Prydz profile", exact: true }).click();
  await expect(page.getByRole("button", { name: /Leviathan/ })).toBeVisible();
  await expect(page.getByLabel("Primary color")).toHaveValue("#68e9ff");
  await page.getByRole("button", { name: "deadmau5 profile", exact: true }).click();
  await expect(page.getByRole("button", { name: /The construct/ })).toBeVisible();
  await page.getByRole("button", { name: "Abstract profile", exact: true }).click();
  await expect(page.getByRole("button", { name: /Laser cathedral/ })).toBeVisible();
  await expect(page.getByLabel("Artist name", { exact: true })).toHaveValue("LIVE SIGNAL");
  const results = await page.evaluate(async () => {
    const visualizerPath = "/src/visualizer.ts";
    const { Visualizer } = await import(/* @vite-ignore */ visualizerPath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "320px";
    document.body.append(canvas);
    const visualizer = new Visualizer(canvas);
    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL unavailable");
    }
    const capture = () => {
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const difference = (a: Uint8Array, b: Uint8Array) => {
      let changed = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta =
          Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
          Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
          Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
        if (delta > 35) {
          changed++;
        }
      }
      return changed / (canvas.width * canvas.height);
    };
    const base = {
      time: 2,
      progress: 0.4,
      bass: 0.7,
      mid: 0.6,
      high: 0.3,
      level: 0.8,
      kick: 0,
      snare: 0,
      drop: 0,
      build: 0,
      drive: 2,
      beat: 4,
      scene: 0,
      palette: 0,
      intensity: 0.9,
      motion: 0.8,
      grain: false,
      flash: false,
      loaded: true,
      laserPhase: 0.4,
      titleReveal: 1,
      titleScatter: 0,
      titleTravel: 0,
    };
    const profiles: Uint8Array[] = [];
    const bright = [];
    for (let profile = 0; profile < 4; profile++) {
      for (let scene = 0; scene < 3; scene++) {
        visualizer.render({ ...base, profile, scene }, 16 / 9);
        const pixels = capture();
        if (scene === 0) {
          profiles.push(pixels);
        }
        let lit = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 90) {
            lit++;
          }
        }
        bright.push(lit);
      }
    }
    visualizer.render({ ...base, artist: "LIVE SIGNAL", titleReveal: 0, titleScatter: 1 }, 16 / 9);
    const hidden = capture();
    visualizer.render({ ...base, artist: "LIVE SIGNAL" }, 16 / 9);
    const formed = capture();
    visualizer.render(
      { ...base, artist: "LIVE SIGNAL", titleScatter: 0.8, titleTravel: 0.7 },
      16 / 9,
    );
    const departing = capture();
    // The subject articulates with camera/time/kick held fixed: geometry must change.
    visualizer.render({ ...base, reachLeft: 0, reachRight: 0, grip: 0.7 }, 16 / 9);
    const resting = capture();
    visualizer.render({ ...base, reachLeft: 1, reachRight: 0.8, grip: 0 }, 16 / 9);
    const reaching = capture();
    const distances = profiles.slice(1).map((pixels) => difference(profiles[0] ?? pixels, pixels));
    visualizer.dispose();
    canvas.remove();
    return {
      bright,
      distances,
      entrance: difference(hidden, formed),
      breakup: difference(formed, departing),
      articulation: difference(resting, reaching),
    };
  });
  for (const lit of results.bright) {
    expect(lit).toBeGreaterThan(500);
  }
  for (const change of results.distances) {
    expect(change).toBeGreaterThan(0.12);
  }
  expect(results.entrance).toBeGreaterThan(0.015);
  expect(results.breakup).toBeGreaterThan(0.015);
  expect(results.articulation).toBeGreaterThan(0.04);
});
