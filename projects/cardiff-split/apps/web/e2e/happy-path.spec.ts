import { expect, test } from "@playwright/test";

test("shows a not found page for a missing trip link", async ({ page }) => {
  await page.goto("/trip/missing-private-trip-link");

  await expect(page.getByRole("heading", { name: "Trip not found" })).toBeVisible();
  await expect(page.getByText("Loading Cardiff Split...")).toBeHidden();
});

test("create a trip, add an expense, and mark a recommendation paid", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Playwright Cardiff Trip");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);
  await expect(page.getByText("Playwright Cardiff Trip")).toBeVisible();

  await navButton(page, "People").click();
  await addParticipant(page, "Alex");
  await addParticipant(page, "Jordan");
  await addParticipant(page, "Sam");

  await navButton(page, "Overview").click();
  await page.getByTestId("add-expense-open").click();
  await page.getByTestId("expense-title").fill("Dinner");
  await page.getByTestId("expense-amount").fill("90.00");
  await expect(page.getByTestId("expense-payer")).toHaveValue("");
  await page.getByTestId("save-expense").click();
  await expect(page.getByText("Who paid is required.")).toBeVisible();
  await page.getByTestId("expense-payer").selectOption({ label: "Alex" });
  await page.getByTestId("save-expense").click();

  await expect(page.getByTestId("balance-Alex")).toContainText("+$60.00");
  await expect(page.getByTestId("balance-Jordan")).toContainText("-$30.00");
  await expect(page.getByTestId("balance-Sam")).toContainText("-$30.00");

  await navButton(page, "Settle up").click();
  await page.getByTestId("mark-paid").first().click();

  await navButton(page, "Overview").click();
  await expect(page.getByTestId("balance-Alex")).toContainText("+$30.00");

  await navButton(page, "Activity").click();
  await expect(page.getByTestId("activity-list")).toContainText("paid Alex $30.00");
});

test("rejects stale payment recommendations from another open page", async ({ browser, page }) => {
  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Playwright Stale Recommendation Trip");
  await page.getByTestId("create-trip-participants").fill("Alex\nJordan\nSam");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);
  const tripUrl = page.url();

  await page.getByTestId("add-expense-open").click();
  await page.getByTestId("expense-title").fill("Dinner");
  await page.getByTestId("expense-amount").fill("90.00");
  await page.getByTestId("expense-payer").selectOption({ label: "Alex" });
  await page.getByTestId("save-expense").click();
  await expect(page.getByTestId("balance-Alex")).toContainText("+$60.00");

  await navButton(page, "Settle up").click();
  await expect(page.getByTestId("mark-paid")).toHaveCount(2);

  const otherPage = await browser.newPage();
  await otherPage.goto(tripUrl);
  await navButton(otherPage, "Settle up").click();
  await expect(otherPage.getByTestId("mark-paid")).toHaveCount(2);

  await page.getByTestId("mark-paid").first().click();
  await expect(page.getByTestId("mark-paid")).toHaveCount(1);

  await otherPage.getByTestId("mark-paid").first().click();
  await expect(
    otherPage.getByText("That payment recommendation is no longer current."),
  ).toBeVisible();
  await otherPage.close();
});

test("add an expense with exact split amounts", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Playwright Exact Split Trip");
  await page.getByTestId("create-trip-participants").fill("Alex\nJordan\nSam\nTaylor");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);

  await page.getByTestId("add-expense-open").click();
  await page.getByTestId("expense-title").fill("Dinner");
  await page.getByTestId("expense-amount").fill("90.00");
  await page.getByTestId("expense-payer").selectOption({ label: "Alex" });
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByLabel("Alex exact amount").fill("30.00");
  await page.getByLabel("Jordan exact amount").fill("60.00");
  await page.getByLabel("Sam exact amount").fill("20.00");
  await page.getByTestId("include-Sam").click();
  await page.getByLabel("Taylor exact amount").fill("0.00");

  expect(pageErrors).toEqual([]);

  await page.getByTestId("save-expense").click();

  await expect(page.getByText("Split between 2 people")).toBeVisible();
  await expect(page.getByTestId("balance-Alex")).toContainText("+$60.00");
  await expect(page.getByTestId("balance-Jordan")).toContainText("-$60.00");
  await expect(page.getByTestId("balance-Sam")).toContainText("$0.00");
  await expect(page.getByTestId("balance-Taylor")).toContainText("$0.00");
});

test("removes a participant from the trip", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Remove Person Trip");
  await page.getByTestId("create-trip-participants").fill("Alex\nJordan");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);

  await navButton(page, "People").click();

  const removeButton = page.getByRole("button", { name: "Remove Alex" });
  await expect(removeButton).toBeVisible();
  await removeButton.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Remove Alex?");
  await expect(dialog).toContainText("This cannot be undone.");

  await dialog.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("Alex")).not.toBeVisible();
  await expect(page.getByText("Jordan")).toBeVisible();
});

test("cancels removing a participant", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Cancel Remove Trip");
  await page.getByTestId("create-trip-participants").fill("Alex\nJordan");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);

  await navButton(page, "People").click();

  const removeButton = page.getByRole("button", { name: "Remove Alex" });
  await removeButton.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Alex")).toBeVisible();
  await expect(page.getByText("Jordan")).toBeVisible();
});

async function addParticipant(page: import("@playwright/test").Page, name: string) {
  await page.getByTestId("participant-name-input").fill(name);
  await page.getByTestId("add-participant-submit").click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

function navButton(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("navigation").getByRole("button", { name });
}
