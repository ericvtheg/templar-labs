import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("renders, morphs, personalizes, and restores a shared universe", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#fallback")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Galaxy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Galaxy", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Bloom", exact: true }).click();
  await page.getByRole("button", { name: "Helix", exact: true }).click();
  await page.getByRole("button", { name: "Your word", exact: true }).click();
  await page.getByLabel("A word. A name. A tiny thought.").fill("MAKE ART");
  await page.getByRole("button", { name: "Make it matter" }).click();
  await expect(page.locator("#word-dialog")).not.toBeVisible();
  await expect(page.locator("#specimen-name")).toHaveText("MAKE ART");
  await page.getByRole("button", { name: "Ocean palette" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Your word", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Ocean palette" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#specimen-name")).toHaveText("MAKE ART");
  expect(errors).toEqual([]);
});

test("scatter returns to order and pause freezes the scene", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.locator("#universe").focus();
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.locator("#chaos-fill").evaluate((node) => Number.parseFloat(node.style.width)))
    .toBeGreaterThan(60);
  await page.keyboard.up("Space");
  await expect
    .poll(() => page.locator("#chaos-fill").evaluate((node) => Number.parseFloat(node.style.width)))
    .toBeLessThan(10);
  await page.getByRole("button", { name: "Pause animation" }).click();
  const before = await page
    .locator("canvas")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(300);
  const after = await page
    .locator("canvas")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  expect(after).toBe(before);
  await page.getByRole("button", { name: "Resume animation" }).click();
  await expect(page.getByRole("button", { name: "Pause animation" })).toBeVisible();
});

test("exports a real 1200-square PNG", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image" }).click();
  const download = await promise;
  expect(download.suggestedFilename()).toBe("little-chaos.png");
  const file = await download.path();
  expect(file).toBeTruthy();
  const data = await readFile(file ?? "");
  expect(data.readUInt32BE(16)).toBe(1200);
  expect(data.readUInt32BE(20)).toBe(1200);
  expect(data.length).toBeGreaterThan(30_000);
});

test("records an eight-second clip and restores the controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const promise = page.waitForEvent("download", { timeout: 25_000 });
  await page.getByRole("button", { name: "Record 8s" }).click();
  await expect(page.getByRole("button", { name: "Save image" })).toBeDisabled();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/^little-chaos\.(mp4|webm)$/);
  const file = await download.path();
  expect((await readFile(file ?? "")).length).toBeGreaterThan(50_000);
  await expect(page.getByRole("button", { name: "Record 8s" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save image" })).toBeEnabled();
});

test("honors reduced motion and supports focus mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Resume animation" })).toBeVisible();
  await page.getByRole("button", { name: "Hide UI" }).click();
  await expect(page.locator(".control-deck")).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Show controls" }).click();
  await expect(page.getByRole("button", { name: "Save image" })).toBeVisible();
});

test("shows a helpful fallback without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type === "webgl" ? null : Reflect.apply(getContext, this, [type, ...args]);
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save image" })).toBeDisabled();
});
