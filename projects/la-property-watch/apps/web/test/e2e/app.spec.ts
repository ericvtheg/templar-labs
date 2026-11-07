import { expect, test } from "@playwright/test";
import { signInLocally } from "./auth-fixture.ts";

const allowedEmail = "ericventor97@gmail.com";

test("signed-out visitors see only the central sign-in gate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Property Watch" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute(
    "href",
    "/api/auth/sign-in?returnTo=/",
  );
  await expect(page.getByText("No public records endpoint")).toBeVisible();
  expect((await page.request.get("/api/research/data")).status()).toBe(401);
  expect((await page.request.get("/api/research/export.csv")).status()).toBe(401);
});

test("authorized researcher ranks, filters, and paginates exact current-first evidence", async ({
  page,
}) => {
  await signInLocally(page.context(), { email: allowedEmail });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Find distress earlier/ })).toBeVisible();
  await expect(
    page.getByLabel("Watchlist summary").getByText("2", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("City of Norfolk · Delinquent Property Taxes")).toBeVisible();
  await expect(page.getByText("City of Norfolk · Neighborhood Quality Violations")).toBeVisible();
  await expect(page.getByText(/Denver registry use requires permission/)).toBeVisible();

  await page.getByLabel("Search properties").fill("15834200");
  await page.getByRole("button", { name: "Search" }).click();
  const property = page.getByRole("button", { name: /2800 VIMY RIDGE AV/ });
  await expect(property).toBeVisible();
  await property.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "58 source rows" })).toBeVisible();
  await expect(dialog.getByText("Showing 1–50 · page 1 of 2")).toBeVisible();
  await expect(dialog.locator(".evidence-card").first()).toContainText(
    "Present in latest complete snapshot",
  );
  await expect(dialog.getByText("$272.26 + $0.00 + $0.00 = $272.26")).toBeVisible();
  await expect(dialog.getByText(/two independent signal types/)).toBeVisible();
  await dialog.getByRole("button", { name: "Next evidence" }).click();
  await expect(dialog.getByText("Showing 51–58 · page 2 of 2")).toBeVisible();
  await expect(dialog.locator(".evidence-card").first()).toContainText("No longer present");
  await expect(dialog.getByRole("button", { name: "Previous evidence" })).toBeEnabled();
  await page.getByRole("button", { name: "Close details" }).click();

  await page.getByLabel("Search properties").fill("");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByLabel("Signal type").selectOption("code_violation");
  await expect(page.getByText("1 properties · page 1 of 1")).toBeVisible();
  await expect(page.getByRole("button", { name: /2800 VIMY RIDGE AV/ })).toBeVisible();
  await page.getByLabel("Signal type").selectOption("tax_delinquency");
  await expect(page.getByText("2 properties · page 1 of 1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Export evidence CSV/ })).toHaveAttribute(
    "href",
    "/api/research/export.csv",
  );
});

test("wrong-email, unverified, and admin sessions cannot enter", async ({ browser }) => {
  for (const identity of [
    { email: "wrong@example.com" },
    { email: allowedEmail, verified: false },
    { email: "admin@example.com", admin: true },
  ]) {
    const context = await browser.newContext();
    await signInLocally(context, identity);
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /restricted account allowlist/ })).toBeVisible();
    expect((await page.request.get("/api/research/data")).status()).toBe(403);
    await context.close();
  }
});

test("refresh is same-origin and returns promptly as queued work", async ({ page }) => {
  await signInLocally(page.context(), { email: allowedEmail });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  const rejected = await page.request.post("/api/research/refresh", {
    headers: { origin: "https://evil.example" },
  });
  expect(rejected.status()).toBe(403);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/research/refresh") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Refresh sources" }).click();
  const response = await responsePromise;
  expect([200, 202]).toContain(response.status());
  await expect(page.getByRole("button", { name: /Refreshing/ })).toBeVisible();
});
