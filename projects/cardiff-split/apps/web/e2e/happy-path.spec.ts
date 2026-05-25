import { expect, test } from "@playwright/test";

test("create a trip, add an expense, and mark a recommendation paid", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("create-trip-name").fill("Playwright Cardiff Trip");
  await page.getByTestId("create-trip-submit").click();
  await expect(page).toHaveURL(/\/trip\//);
  await expect(page.getByText("Playwright Cardiff Trip")).toBeVisible();

  await page.getByRole("button", { name: "People" }).click();
  await addParticipant(page, "Alex");
  await addParticipant(page, "Jordan");
  await addParticipant(page, "Sam");

  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByTestId("add-expense-open").click();
  await page.getByTestId("expense-title").fill("Dinner");
  await page.getByTestId("expense-amount").fill("90.00");
  await page.getByTestId("expense-payer").selectOption({ label: "Alex" });
  await page.getByTestId("save-expense").click();

  await expect(page.getByTestId("balance-Alex")).toContainText("+$60.00");
  await expect(page.getByTestId("balance-Jordan")).toContainText("-$30.00");
  await expect(page.getByTestId("balance-Sam")).toContainText("-$30.00");

  await page.getByRole("button", { name: "Settle up" }).click();
  await page.getByTestId("mark-paid").first().click();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByTestId("balance-Alex")).toContainText("+$30.00");

  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByTestId("activity-list")).toContainText("paid Alex $30.00");
});

async function addParticipant(page: import("@playwright/test").Page, name: string) {
  await page.getByTestId("participant-name-input").fill(name);
  await page.getByTestId("add-participant-submit").click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}
