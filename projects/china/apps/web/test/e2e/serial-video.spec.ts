import { expect, test } from "@playwright/test";
import { crew, fieldNotes, groom, missions } from "../../src/lib/curriculum.ts";

test("food chapter separates watching, reflection, and payoff without loading YouTube automatically", async ({
  page,
}) => {
  const foodIndex = missions.findIndex((mission) => mission.id === "feast");
  const food = missions[foodIndex];
  if (!food) {
    throw new Error("Missing food chapter");
  }
  await page.route("**/api/trip/state", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-learner", name: "Gavin" },
        groom,
        crew,
        missions,
        fieldNotes,
        completed: missions.slice(0, foodIndex).map((mission) => mission.id),
        mastery: [...food.phrases.map((_, task) => task), food.phrases.length].map((task) => ({
          mission_id: food.id,
          task,
          level: 1,
          due: 0,
        })),
        board: [],
        activity: [],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".mission-grid")).toBeHidden();
  await page.getByRole("button", { name: /Pick up where you left off/ }).click();
  await page.getByRole("button", { name: /Let’s begin/ }).click();
  await page.getByRole("button", { name: /Finish without the AI practice/ }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByLabel(/What was broadly happening/)).toHaveCount(0);
  await page.getByRole("button", { name: /Video blocked/ }).click();
  await page.getByRole("button", { name: /Tell the boys what you caught/ }).click();
  await expect(page.locator(".radio-scene, iframe")).toHaveCount(0);
  await expect(page.locator(".session-screen input, .session-screen textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "Ordering food", exact: true }).click();
  await page.getByRole("button", { name: "A greeting", exact: true }).click();
  await page.getByRole("button", { name: "Keep going →", exact: true }).click();
  await expect(page.getByText("Clue: A greeting")).toBeVisible();
  await page.getByRole("button", { name: /What happens next/ }).click();
  await expect(page.locator(".session-reveal")).toHaveCount(1);
  await page.getByRole("button", { name: /Emergency guide/ }).click();
  await expect(page.getByRole("link", { name: /120 Ambulance/ })).toHaveAttribute(
    "href",
    "tel:120",
  );
});
