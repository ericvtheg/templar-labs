import { expect, test } from "@playwright/test";
import { signInLocally } from "./auth-fixture.ts";

test("mobile ranked workflow and evidence continuation remain usable without overflow", async ({
  page,
}) => {
  await signInLocally(page.context(), { email: "ericventor97@gmail.com" });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Find distress earlier/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  ).toBe(false);
  await page.getByLabel("Search properties").fill("VIMY RIDGE");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /2800 VIMY RIDGE AV/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Showing 1–50 · page 1 of 2")).toBeVisible();
  await dialog.getByRole("button", { name: "Next evidence" }).click();
  await expect(dialog.getByText("Showing 51–58 · page 2 of 2")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  ).toBe(false);
  await expect(dialog.getByRole("link", { name: "Open source" }).first()).toBeVisible();
});
