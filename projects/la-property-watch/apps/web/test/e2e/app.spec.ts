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

test("authorized research workflow filters records and opens provenance details", async ({
  page,
}) => {
  await signInLocally(page.context(), { email: allowedEmail });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Find distress earlier/ })).toBeVisible();
  await expect(page.getByText("184", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Three-Year Delinquency/).first()).toBeVisible();
  await expect(page.getByText(/Impending Power to Sell/).first()).toBeVisible();
  await expect(page.getByText("CNPA Public Notices")).toBeVisible();

  await page.getByLabel("Search records").fill("4007-017-003");
  await expect(page.getByRole("button", { name: /6410 7th Avenue/ })).toBeVisible();
  await page.getByRole("button", { name: /6410 7th Avenue/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Sale-status line (not homeowner)")).toBeVisible();
  await expect(page.getByText("(714) 730-2727")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" })).toHaveAttribute(
    "href",
    /capublicnotice\.com\/advert/,
  );
  await page.getByRole("button", { name: "Close details" }).click();

  await page.getByLabel("Search records").fill("");
  await page.getByLabel("Signal stage").selectOption("tax_delinquency");
  await expect(page.getByText("4 shown")).toBeVisible();
  await page.getByLabel("Signal stage").selectOption("all");
  await page.getByLabel("Market jurisdiction").selectOption("oc-ca");
  await expect(page.getByText("188 shown")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Past · outcome unverified/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Export CSV/ })).toHaveAttribute(
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
