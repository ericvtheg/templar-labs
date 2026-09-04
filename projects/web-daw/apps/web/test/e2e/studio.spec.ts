import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("opens a ready demo, plays real audio, and persists an edited groove", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("Session name")).toHaveValue("Afterglow");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.screenshot({ path: "/tmp/web-daw-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".master-mini i")
        .evaluate((el) => Number.parseFloat((el as HTMLElement).style.width)),
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId("position")).not.toHaveText("01.1.1");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Deep Kick clip at bar 1", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Step 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Deep Kick clip at bar 1", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(errors).toEqual([]);
});

test("adds an instrument, edits notes, shares the result, and renders a stereo WAV", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByLabel("Search library").fill("FM Bell");
  await page.getByRole("button", { name: "Preview FM Bell", exact: true }).click();
  await page.getByRole("button", { name: "Add FM Bell", exact: true }).click();
  const grid = page.getByRole("application", { name: /Piano roll/ });
  await grid.click({ position: { x: 70, y: 70 } });
  await expect(page.locator(".midi-note")).toHaveCount(1);
  await page.locator(".midi-note").click();
  await page.getByLabel("Note length", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "Devices", exact: false }).click();
  await page.getByRole("button", { name: "Enable Echo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bypass Echo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const url = await page.getByLabel("Share URL").inputValue();
  expect(url.length).toBeLessThan(15000);
  const shared = await context.newPage();
  await shared.goto(url);
  await expect(shared.locator(".track-row")).toHaveCount(9);
  await expect(shared.getByLabel("Session name")).toHaveValue("Afterglow");
  await shared.close();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV", exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("Afterglow.wav");
  const path = await file.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path as string);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.readUInt16LE(22)).toBe(2);
  expect(bytes.readUInt32LE(24)).toBe(44100);
  expect(bytes.length).toBeGreaterThan(6_000_000);
  let peak = 0;
  let energy = 0;
  for (let i = 44; i < bytes.length; i += 2) {
    const n = bytes.readInt16LE(i);
    peak = Math.max(peak, Math.abs(n));
    energy += n * n;
  }
  expect(peak).toBeGreaterThan(1000);
  expect(peak).toBeLessThan(32767);
  expect(Math.sqrt(energy / ((bytes.length - 44) / 2))).toBeGreaterThan(100);
});

test("switches demos, isolates tracks, records keyboard notes, and stays usable on mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: /Night Transit HOUSE/ }).click();
  await expect(page.getByLabel("Tempo", { exact: true })).toHaveValue("124");
  await page.getByRole("button", { name: "Solo Deep Kick", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".track-row")
        .nth(0)
        .locator(".track-meter i")
        .evaluate((el) => Number.parseFloat((el as HTMLElement).style.height)),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page
        .locator(".track-row")
        .nth(4)
        .locator(".track-meter i")
        .evaluate((el) => Number.parseFloat((el as HTMLElement).style.height)),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Solo Deep Kick", exact: true }).click();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: /Start from a blank canvas/ }).click();
  await page.getByRole("button", { name: "Record computer keyboard", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.keyboard.press("a");
  await expect(page.locator(".midi-note")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/web-daw-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeInViewport();
});

test("edits an independent clip, moves notes, and preserves local changes after opening a share", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByRole("button", { name: "Deep Kick clip at bar 1", exact: true }).click();
  await page.getByRole("button", { name: "Make unique", exact: true }).click();
  await page.getByRole("button", { name: "Step 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Deep Kick clip at bar 5", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Velvet Keys clip at bar 1", exact: true }).dblclick();
  const note = page.locator(".midi-note").first();
  const old = await note.getAttribute("aria-label");
  await note.dragTo(page.getByRole("application", { name: /Piano roll/ }), {
    targetPosition: { x: 100, y: 36 },
  });
  await expect(page.getByRole("button", { name: old as string, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page.getByLabel("Share URL").inputValue();
  await page.goto(link);
  await expect(page).toHaveURL("http://127.0.0.1:5183/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByLabel("Session name").fill("My remix");
  await expect(page.getByLabel("Session name")).toHaveValue("My remix");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("web-daw.session.v1") ?? "{}").name),
    )
    .toBe("My remix");
  await page.reload();
  await expect(page.getByLabel("Session name")).toHaveValue("My remix");
});

test("renders all six instrument families and verifies every effect changes the audio", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const result = await page.evaluate(async () => {
    const audioPath = "/src/lib/audio.ts";
    const modelPath = "/src/lib/session.ts";
    const { AudioEngine } = await import(audioPath);
    const { makeTrack } = await import(modelPath);
    const base = {
      version: 1,
      name: "Audio verification",
      bpm: 120,
      swing: 0,
      bars: 4,
      master: 0.8,
      tracks: [makeTrack("synth-analog-0", 0)],
    };
    base.tracks[0].notes = [{ step: 0, pitch: 60, duration: 8, velocity: 0.8 }];
    base.tracks[0].clips = [{ id: "test", start: 0, bars: 1 }];
    const engine = new AudioEngine(base);
    const analyze = async (session: typeof base) => {
      const blob = await engine.exportWav(session);
      const bytes = await blob.arrayBuffer();
      const view = new DataView(bytes);
      let energy = 0;
      let peak = 0;
      for (let i = 44; i < bytes.byteLength; i += 2) {
        const n = view.getInt16(i, true);
        energy += n * n;
        peak = Math.max(peak, Math.abs(n));
      }
      return { energy, peak };
    };
    const voices = [];
    for (const voice of ["analog", "bass", "keys", "pad", "pluck", "fm"]) {
      const session = structuredClone(base);
      session.tracks[0].sound = `synth-${voice}-0`;
      voices.push(await analyze(session));
    }
    const dry = await analyze(base);
    const processed = [];
    for (const id of ["filter", "drive", "delay", "reverb", "compressor"]) {
      const session = structuredClone(base);
      session.tracks[0].effects[id] = { enabled: true, value: id === "filter" ? 0.1 : 0.9 };
      processed.push(await analyze(session));
    }
    return { voices, dry, processed };
  });
  for (const voice of result.voices) {
    expect(voice.energy).toBeGreaterThan(1000);
    expect(voice.peak).toBeLessThan(32767);
  }
  for (const effect of result.processed) {
    expect(Math.abs(effect.energy - result.dry.energy)).toBeGreaterThan(result.dry.energy * 0.001);
  }
});
