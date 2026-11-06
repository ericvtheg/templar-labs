import { expect, test } from "@playwright/test";
import { signInLocally } from "./auth-fixture.ts";

test("mobile dashboard remains usable without horizontal overflow", async ({ page }) => {
  await signInLocally(page.context(), { email: "ericventor97@gmail.com" });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Find distress earlier/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.getByLabel("Search records").fill("4007");
  await page.getByRole("button", { name: /6410 7th Avenue/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" })).toBeVisible();
});
