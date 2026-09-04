import { expect, type Page, test } from "@playwright/test";
import type { Session } from "../../src/lib/session";

const command = process.platform === "darwin" ? "Meta" : "Control";
async function stored(page: Page): Promise<Session> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("web-daw.session.v1") ?? "{}"));
}
async function blank(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: /Start from a blank canvas/ }).click();
}

test("writes a phrase using familiar piano-roll gestures and preserves the result", async ({
  page,
}) => {
  await blank(page);
  const grid = page.locator(".producer-canvas");
  const surface = page.locator(".producer-editor");
  const box = await grid.boundingBox();
  if (!box) {
    throw new Error("Missing piano roll");
  }
  const point = (step: number, pitch: number) => ({
    x: box.x + ((step + 0.2) / 16) * box.width,
    y: box.y + (96 - pitch) * 14 + 7,
  });
  const first = point(0, 60);
  await page.mouse.dblclick(first.x, first.y);
  await expect(page.locator(".producer-note")).toHaveCount(1);
  await surface.focus();
  await page.keyboard.press("b");
  const second = point(4, 64);
  const end = point(7, 64);
  await page.mouse.move(second.x, second.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".producer-note")).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (await stored(page)).tracks[0]?.clips[0]?.pattern?.notes.find((n) => n.step === 4)
          ?.duration,
    )
    .toBe(4);
  await page.keyboard.press("b");
  // A marquee selects both pitches; one transpose preserves the interval.
  const corner = point(0, 64);
  const far = point(9, 59);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(far.x, far.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".producer-note.selected")).toHaveCount(2);
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.getByRole("button", { name: "C5 at step 1", exact: true })).toBeAttached();
  await page.keyboard.press(`${command}+d`);
  await expect(page.locator(".producer-note")).toHaveCount(4);
  await page.keyboard.press(`${command}+z`);
  await expect(page.locator(".producer-note")).toHaveCount(2);
  await page.keyboard.press(`${command}+Shift+z`);
  await expect(page.locator(".producer-note")).toHaveCount(4);
  await page.keyboard.press(`${command}+a`);
  await page.keyboard.press(`${command}+c`);
  await page.getByLabel("Pattern length", { exact: true }).selectOption("32");
  await page
    .locator(".piano-beats button")
    .filter({ hasText: /^2\.1$/ })
    .click();
  await page.keyboard.press(`${command}+v`);
  await expect(page.locator(".producer-note")).toHaveCount(8);
  await page.keyboard.press("Delete");
  await expect(page.locator(".producer-note")).toHaveCount(4);
  await page.keyboard.press(`${command}+z`);
  await expect(page.locator(".producer-note")).toHaveCount(8);
  // A pointer resize is a single undoable edit.
  const note = page.getByRole("button", { name: "C5 at step 1", exact: true });
  await note.scrollIntoViewIfNeeded();
  await note.click();
  const handle = await note.locator(".note-resize-handle").boundingBox();
  const width = await grid.evaluate((el) => el.getBoundingClientRect().width);
  if (!handle) {
    throw new Error("Missing note resize handle");
  }
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + (width / 32) * 2, handle.y + 5, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await stored(page)).tracks[0]?.clips[0]?.pattern?.notes.find((n) => n.step === 0)
          ?.duration,
    )
    .toBe(3);
  await page.keyboard.press(`${command}+z`);
  await expect
    .poll(
      async () =>
        (await stored(page)).tracks[0]?.clips[0]?.pattern?.notes.find((n) => n.step === 0)
          ?.duration,
    )
    .toBe(1);
  await page.reload();
  await page.locator(".clip-body").first().dblclick();
  await expect(page.locator(".producer-note")).toHaveCount(8);
});

test("arranges independent clips, trims them, copies across tracks, and loops a region", async ({
  page,
}) => {
  await blank(page);
  await page.locator(".producer-editor").focus();
  await page.keyboard.press("Enter");
  await page.locator(".clip-body").first().click();
  await page.keyboard.press(`${command}+d`);
  await expect(page.locator(".clip-body")).toHaveCount(2);
  await page.keyboard.press(`${command}+l`);
  await expect.poll(async () => (await stored(page)).loop).toEqual({ start: 4, end: 8 });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".master-mini i")
        .evaluate((el) => Number.parseFloat((el as HTMLElement).style.width)),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const second = page.locator(".arrangement-clip").nth(1);
  const handle = await second.locator(".clip-resize.right").boundingBox();
  const lane = page.locator(".track-lane").first();
  const box = await lane.boundingBox();
  if (!handle || !box) {
    throw new Error("Missing arrangement");
  }
  await page.mouse.move(handle.x + 3, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 3 - (box.width / 16) * 2, handle.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await stored(page)).tracks[0]?.clips[1]?.bars).toBe(2);
  await page.keyboard.press(`${command}+z`);
  await expect.poll(async () => (await stored(page)).tracks[0]?.clips[1]?.bars).toBe(4);
  // Native dragging keeps the point grabbed inside the clip aligned with the destination.
  await second.locator(".clip-body").dragTo(lane, {
    sourcePosition: { x: 15, y: 12 },
    targetPosition: { x: (box.width / 16) * 8 + 15, y: 20 },
  });
  await expect
    .poll(async () => (await stored(page)).tracks[0]?.clips.find((c) => c.start === 8)?.bars)
    .toBe(4);
  await page.locator(".clip-body").nth(1).click();
  await page.keyboard.press(`${command}+c`);
  await page.getByRole("button", { name: "Add instrument track", exact: true }).click();
  const target = page.locator(".track-lane").nth(1);
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Missing destination track");
  }
  await target.click({ position: { x: (targetBox.width / 16) * 8 + 8, y: 20 } });
  await page.keyboard.press(`${command}+v`);
  await expect
    .poll(
      async () =>
        (await stored(page)).tracks[1]?.clips.find((c) => c.start === 8)?.pattern?.notes.length,
    )
    .toBe(1);
  await page.locator(".track-row").nth(1).locator(".clip-body").nth(1).dblclick();
  await page.locator(".producer-editor").focus();
  await page.keyboard.press(`${command}+a`);
  await page.keyboard.press("Delete");
  await page.locator(".track-row").first().locator(".clip-body").nth(1).dblclick();
  await expect(page.locator(".producer-note")).toHaveCount(1);
});
