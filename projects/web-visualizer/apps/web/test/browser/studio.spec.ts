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
  await expect(page.getByRole("heading", { name: "Your sound. A whole new world." })).toBeVisible();
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
  await page.getByRole("button", { name: /Tidal bloom/ }).click();
  await expect(page.getByRole("button", { name: /Tidal bloom/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".stage-caption h2")).toHaveText("Tidal bloom.");
  await page.getByRole("button", { name: "Glacier", exact: true }).click();
  await page.getByRole("switch", { name: "Film grain" }).click();
  await expect(page.getByRole("switch", { name: "Film grain" })).toHaveAttribute(
    "aria-checked",
    "false",
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
    .locator('input[type="file"]')
    .setInputFiles({ name: "Journey.wav", mimeType: "audio/wav", buffer: wav(20) });
  await expect(page.locator(".track-title strong")).toHaveText("Journey");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.getByRole("slider", { name: "Track position" }).inputValue();
  await page.waitForTimeout(400);
  expect(await page.getByRole("slider", { name: "Track position" }).inputValue()).toBe(paused);
  await page.getByRole("button", { name: /05.*Afterglow/ }).click();
  await expect(page.locator(".stage-caption h2")).toHaveText("Afterglow.");
  expect(
    Number(await page.getByRole("slider", { name: "Track position" }).inputValue()),
  ).toBeCloseTo(17.6, 1);
  await page.getByRole("button", { name: "Restart track" }).click();
  await expect(page.getByRole("slider", { name: "Track position" })).toHaveValue("0");
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("not audio"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(page.locator(".track-title strong")).toHaveText("Journey");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "Replacement.WAV", mimeType: "audio/wav", buffer: wav(2) });
  await expect(page.locator(".track-title strong")).toHaveText("Replacement");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.locator(".stage-caption h2")).toHaveText("Afterglow.");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("exports a full film with video and audio tracks", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "Export.wav", mimeType: "audio/wav", buffer: wav(3) });
  await expect(page.locator(".track-title strong")).toHaveText("Export");
  await page.getByRole("button", { name: "Export film" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Render film" }).click();
  await expect(page.locator(".export-progress")).toContainText("Rendering your journey");
  await expect(page.getByLabel("Aspect ratio")).toBeDisabled();
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
  await expect(page.locator(".track-title strong")).toHaveText("Somewhere, beyond");
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
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/tone.mp3");
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
    .locator('input[type="file"]')
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
