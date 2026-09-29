import { expect, test } from "@playwright/test";

test("saves and publishes actual Puck payloads without duplicate in-flight mutations", async ({
  page,
}) => {
  await page.goto("/test/browser/editor-harness.html");

  const editor = page.getByRole("region", { name: "Visual page editor" });
  const save = page.locator(".editor-toolbar-actions > button");
  const paperTone = page.getByRole("combobox", { name: "Paper tone" });
  await paperTone.click();
  await paperTone.press("ArrowDown");
  await paperTone.press("Enter");
  await expect(save).toBeEnabled();

  await save.click();
  await expect(editor).toHaveAttribute("aria-busy", "true");
  await expect(save).toBeDisabled();
  await expect(page.locator('button[aria-label="Move Details up"]')).toBeDisabled();
  await page.evaluate(() => window.weddingEditorSmoke.releasePending?.());
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(editor).toHaveAttribute("aria-busy", "false");
  await expect(save).toBeDisabled();

  const afterSave = await page.evaluate(() => window.weddingEditorSmoke);
  expect(afterSave.auth).toBe("isolated-authorized-fixture");
  expect(afterSave.savePayloads).toHaveLength(1);
  expect(afterSave.saveMetadata).toEqual([{ hasRootReadOnly: true, hasZones: true }]);
  expect(afterSave.savePayloads[0]?.zones).toEqual({});
  expect(afterSave.saved?.root.props.paperTone).toBe("blush");
  expect(Reflect.has(afterSave.saved ?? {}, "zones")).toBe(false);

  await page.getByText("Publish", { exact: true }).evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
  });
  await expect(editor).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.weddingEditorSmoke.publishPayloads.length)).toBe(1);
  await page.evaluate(() => window.weddingEditorSmoke.releasePending?.());
  await expect(
    page.getByText("Published. The public website now shows this version."),
  ).toBeVisible();
  await expect(editor).toHaveAttribute("aria-busy", "false");

  const afterPublish = await page.evaluate(() => window.weddingEditorSmoke);
  expect(afterPublish.publishPayloads).toHaveLength(1);
  // Save remounts Puck from normalized data; readOnly is absent until the next field edit.
  expect(afterPublish.publishMetadata).toEqual([{ hasRootReadOnly: false, hasZones: true }]);
  expect(afterPublish.publishPayloads[0]?.zones).toEqual({});
  expect(afterPublish.published).toEqual(afterPublish.saved);
  expect(Reflect.has(afterPublish.published ?? {}, "zones")).toBe(false);
});
