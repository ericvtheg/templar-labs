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

test("failed OAuth callbacks explain the failure instead of silently returning to sign-in", async ({
  page,
}) => {
  await page.goto("/api/auth/callback?error=oauth");
  await expect(page.getByRole("alert")).toContainText("missing_transaction");
  await expect(page.getByRole("alert")).toContainText("Start sign-in again");
  expect(new URL(page.url()).searchParams.has("failure")).toBe(false);

  const start = await page.request.get("/api/auth/sign-in?returnTo=/", { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const authorization = new URL(start.headers()["location"]!);
  expect(authorization.pathname).toBe("/api/auth/first-party/authorize");
  expect(new URL(authorization.searchParams.get("callback")!).pathname).toBe("/api/auth/callback");
  await page.goto(
    `/api/auth/callback?error=oauth&state=${authorization.searchParams.get("state")}`,
  );
  await expect(page.getByRole("alert")).toContainText("provider");
  await expect(page.getByRole("alert")).toContainText("cancelled or rejected");
  expect((await page.request.get("/api/research/data")).status()).toBe(401);

  await page.goto("/?error=auth&auth_reason=untrusted-upstream-secret");
  await expect(page.getByRole("alert")).toContainText("unknown");
  await expect(page.getByRole("alert")).not.toContainText("untrusted-upstream-secret");
});

test("access denial offers an account chooser rather than a local-only sign-out", async ({
  page,
}) => {
  await page.goto("/?error=auth&auth_reason=access");
  await expect(page.getByRole("alert")).toContainText("not authorized");
  const switchAccount = page.getByRole("link", { name: "Switch Google account" });
  await expect(switchAccount).toHaveAttribute("href", "/api/auth/sign-in?returnTo=/");
  // Stop before the external identity provider; inspect the real app response.
  const response = await page.request.get((await switchAccount.getAttribute("href")) ?? "", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  const authorization = new URL(response.headers()["location"]!);
  expect(authorization.searchParams.get("prompt")).toBe("select_account");
  expect(authorization.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await page.request.get("/api/research/data")).status()).toBe(401);
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
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const property = page.getByRole("button", { name: /2800 VIMY RIDGE AV/ });
  await expect(property).toBeVisible();
  await property.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "58 source rows" })).toBeVisible();
  await expect(dialog.getByText("Showing 1–50 · page 1 of 2")).toBeVisible();
  await expect(dialog.locator(".evidence-card").first()).toContainText(
    "Present in latest source observation",
  );
  await expect(dialog.getByText("$272.26 + $0.00 + $0.00 = $272.26")).toBeVisible();
  await expect(dialog.getByText(/two independent signal types/)).toBeVisible();
  await dialog.getByRole("button", { name: "Next evidence" }).click();
  await expect(dialog.getByText("Showing 51–58 · page 2 of 2")).toBeVisible();
  await expect(dialog.locator(".evidence-card").first()).toContainText("No longer present");
  await expect(dialog.getByRole("button", { name: "Previous evidence" })).toBeEnabled();
  await page.getByRole("button", { name: "Close details" }).click();

  await page.getByLabel("Search properties").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
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

test("partners complete and retain the shortlist, buy-box, review, note, alert, and selected-export workflow", async ({
  page,
  browser,
}) => {
  await signInLocally(page.context(), { email: allowedEmail });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();

  await page.getByRole("button", { name: "Buy boxes" }).click();
  const buyBox = page.locator(".buy-box-form");
  await buyBox.getByLabel("Name", { exact: true }).fill("Norfolk partner criteria");
  await buyBox.getByLabel("sfh").check();
  await buyBox.getByLabel("Markets (jurisdiction IDs)").fill("norfolk-va");
  await buyBox.getByLabel("ZIPs").fill("23509");
  await buyBox.getByRole("button", { name: "Create buy box" }).click();
  await expect(page.getByRole("option", { name: "Norfolk partner criteria" })).toBeAttached();

  await page.getByRole("button", { name: "Shortlist" }).click();
  await page.getByLabel("Search properties").fill("15834200");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Select 2800 VIMY RIDGE AV").check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export selected \(1\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^property-watch-selected-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.getByRole("button", { name: /2800 VIMY RIDGE AV/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Shared review controls/)).toBeVisible();
  await dialog.getByLabel("Saved / followed").check();
  await dialog.getByLabel("Stage").selectOption("Researching");
  await dialog.getByLabel("Assign").selectOption("Rhwcreative@gmail.com");
  await dialog.getByLabel("Follow-up").fill("2026-11-07T09:00");
  await dialog.getByRole("button", { name: "Save review state" }).click();
  await expect(dialog.getByText(/Shared review controls · version 1/)).toBeVisible();
  await dialog
    .getByPlaceholder("Add a sourced research note…")
    .fill("Confirmed exact parcel; tax status still needs current verification.");
  await dialog.getByRole("button", { name: /Add note as/ }).click();
  await expect(
    dialog.getByText("Confirmed exact parcel; tax status still needs current verification."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();

  await page.getByRole("button", { name: "Pipeline" }).click();
  await expect(page.getByRole("heading", { name: "Review pipeline" })).toBeVisible();
  await expect(page.getByText(/Researching · Saved/)).toBeVisible();
  await expect(page.getByText(/Assigned Rhwcreative@gmail.com/)).toBeVisible();
  await page.getByRole("button", { name: /Alerts \(/ }).click();
  await expect(page.getByRole("heading", { name: "Saved-property alerts" })).toBeVisible();
  await expect(page.getByText("Follow-up is due")).toBeVisible();
  await page.getByRole("button", { name: "Mark read" }).click();
  await expect(page.getByText(/Read/).last()).toBeVisible();

  await page.reload();
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await page.getByRole("button", { name: "Pipeline" }).click();
  await expect(page.getByText(/Researching · Saved/)).toBeVisible();

  const partnerContext = await browser.newContext();
  await signInLocally(partnerContext, { email: "rhwcreative@gmail.com" });
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/");
  await expect(partnerPage.locator("[data-hydrated=true]")).toBeVisible();
  await partnerPage.getByRole("button", { name: "Buy boxes" }).click();
  await expect(
    partnerPage.getByRole("option", { name: "Norfolk partner criteria" }),
  ).toBeAttached();
  await partnerPage.getByRole("button", { name: "Pipeline" }).click();
  await expect(partnerPage.getByText(/Researching · Saved/)).toBeVisible();
  await partnerContext.close();
});
