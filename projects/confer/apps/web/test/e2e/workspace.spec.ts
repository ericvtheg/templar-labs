import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Document, Packer, Paragraph } from "docx";
import { extractRawText } from "mammoth";
import { importText, pdfFixture } from "./fixtures.ts";

const storageKey = "confer.workspace.v1";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Discovery, clarified." })).toBeVisible();
});

test("sample review, search, filter, source links, and decisions work without persisting", async ({
  page,
}) => {
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await expect(page.getByRole("button", { name: "All responses 12", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Review Request for production No. 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText(
      "Responding party objects that this request is vague, ambiguous, overly broad, and unduly burdensome. Responding party will not produce documents in response to this request.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss finding", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flagged 7", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Review Request for production No. 2", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your review notes" })
    .fill("Check whether a privilege log was separately served.");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reviewed 3", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search requests and responses" }).fill("insurance");
  await expect(
    page.getByRole("button", { name: "Review Request for production No. 7", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search requests and responses" }).fill("");
  await page.getByRole("combobox", { name: "Filter by discovery type" }).selectOption("ROG");
  await expect(
    page.getByRole("button", { name: "Review Interrogatory No. 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review Interrogatory No. 1", exact: true }).click();
  await page
    .getByRole("button", { name: /Interrogatory responses · Set One.txt · text page 1/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Interrogatory responses · Set One.txt" }),
  ).toBeVisible();
  await expect(page.locator(".source-text")).toContainText("SPECIAL INTERROGATORY NO. 1");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("letter drafts are editable and the exported Word file contains current edits", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Draft a letter", exact: true }).click();
  const create = page
    .getByRole("dialog")
    .getByRole("button", { name: "Create draft", exact: true });
  await expect(create).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand this is a draft/ }).check();
  await create.click();
  const content = page.getByRole("textbox", { name: "Draft content", exact: true });
  await expect(content).toHaveValue(/FOR ATTORNEY REVIEW ONLY/);
  expect(await content.inputValue()).toContain("FINDING NOT YET REVIEWED");
  const edited = `${await content.inputValue()}\nExport test: counsel edited this draft.`;
  await content.fill(edited);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Word", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("meet-and-confer-letter.docx");
  const output = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(output);
  const exported = await extractRawText({ buffer: await readFile(output) });
  expect(exported.value).toContain("Export test: counsel edited this draft.");
  expect(exported.value).toContain("Request for production No. 1");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /Meet-and-confer letter.*Edited/ }).click();
  expect(await page.getByRole("textbox", { name: "Draft content" }).inputValue()).toContain(
    "Export test: counsel edited this draft.",
  );
});

test("motion outline keeps factual history, law, and court deadlines as verified-research placeholders", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Build a motion outline", exact: true }).click();
  await page.getByRole("checkbox", { name: /I understand this is a draft/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Create draft", exact: true }).click();
  const content = await page.getByRole("textbox", { name: "Draft content" }).inputValue();
  expect(content).toContain("NOT proof that a meet-and-confer took place");
  expect(content).toContain("No authorities or court deadlines have been generated");
  expect(content).toContain("WORKING OUTLINE");
});

test("new matters support TXT, PDF, DOCX, pasted imports, and reject duplicate sources", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Create your own", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Matter name", exact: true })
    .fill("Local import test matter");
  await page.getByRole("button", { name: "Create matter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with the source" })).toBeVisible();
  await page.getByRole("button", { name: "Import responses", exact: true }).first().click();
  await page.getByLabel("Choose discovery document", { exact: true }).setInputFiles({
    name: "responses.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(importText),
  });
  await page.getByRole("button", { name: "Add 1 responses", exact: true }).click();
  await expect(page.getByRole("button", { name: "All responses 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import responses", exact: true }).click();
  await page
    .getByLabel("Choose discovery document", { exact: true })
    .setInputFiles({ name: "responses.pdf", mimeType: "application/pdf", buffer: pdfFixture() });
  await page.getByRole("button", { name: "Add 1 responses", exact: true }).click();
  await expect(page.getByRole("button", { name: "All responses 2", exact: true })).toBeVisible();
  const docx = new Document({
    sections: [
      {
        children: importText
          .replace("NO. 1", "NO. 3")
          .replace("NO. 1", "NO. 3")
          .split("\n")
          .map((line) => new Paragraph(line)),
      },
    ],
  });
  await page.getByRole("button", { name: "Import responses", exact: true }).click();
  await page.getByLabel("Choose discovery document", { exact: true }).setInputFiles({
    name: "responses.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await Packer.toBuffer(docx),
  });
  await page.getByRole("button", { name: "Add 1 responses", exact: true }).click();
  await expect(page.getByRole("button", { name: "All responses 3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import responses", exact: true }).click();
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await page.getByRole("textbox", { name: "Numbered requests and responses" }).fill(importText);
  await page.getByRole("button", { name: "Analyze responses", exact: true }).click();
  await page.getByRole("button", { name: "Add 1 responses", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already in the matter");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Documents 3", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your source documents" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("keyboard search and dialog focus restoration work", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Search requests and responses" })).toBeFocused();
  const trigger = page.getByRole("button", {
    name: "Review Request for production No. 1",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("device saving is opt-in, survives reload, and can remove the browser copy", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open workspace settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Save on this device", exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).not.toBeNull();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved on device", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open workspace settings", exact: true }).click();
  await page.getByRole("switch", { name: "Save on this device", exact: true }).uncheck();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await expect(page.getByText(/unencrypted browser storage/)).toBeVisible();
});

test("layout is responsive, navigation works, and the app makes no external content requests", async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) {
      external.push(request.url());
    }
  });
  await page.reload();
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  }
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "A little less busywork." })).toBeVisible();
  await page.getByRole("button", { name: /Mitchell v. Acme Industries.*responses/ }).click();
  await expect(page.getByRole("heading", { name: "Discovery, clarified." })).toBeVisible();
  expect(external).toEqual([]);
});
