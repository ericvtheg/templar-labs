import { expect, test } from "@playwright/test";

test("dashboard is responsive, finite, and explicitly a preview", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hey Jamie, welcome back." })).toBeVisible();
  await expect(page.getByText("Take a look around.")).toBeVisible();
  await expect(page.getByRole("button", { name: /The weekly unplug/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("check-in edits persist and expose no fake automatic tracking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Log screen time", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(/Open Screen Time/)).toBeVisible();
  await modal.getByLabel("Instagram", { exact: true }).fill("10");
  await modal.getByLabel("TikTok", { exact: true }).fill("0");
  await modal.getByLabel("YouTube", { exact: true }).fill("5");
  await modal.getByLabel("Everything else", { exact: true }).fill("0");
  await modal.getByLabel(/What did you do instead/).fill("Went for a long walk.");
  await modal.getByRole("button", { name: "Save check-in" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByText("Went for a long walk.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Went for a long walk.")).toBeVisible();
  await page.getByRole("button", { name: "Log screen time", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Instagram", { exact: true })).toHaveValue("10");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Log screen time", exact: true })).toBeFocused();
});

test("custom challenges work and preview invitations never pretend to be shared", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create challenge", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Give it a name").fill("Phones down at dinner");
  await modal.getByLabel("What are you playing for?").fill("Choose our next road trip");
  await modal.getByRole("button", { name: "Let’s do this" }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole("button", { name: /Phones down at dinner/ }).click();
  await expect(page.getByRole("dialog").getByText("Choose our next road trip")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Invite friends" }).click();
  await expect(page.getByRole("dialog").getByText("Bring your real friends.")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Continue with Breli" }),
  ).toHaveAttribute("href", "/api/auth/sign-in");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("button", { name: /Phones down at dinner/ })).toBeVisible();
});

test("navigation, goals, filters, timer and keyboard dismissal work", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: isMobile ? "Mobile navigation" : "Main navigation",
  });
  await nav.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByRole("heading", { name: "Your people", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "Rewards" }).click();
  await expect(page.getByText("You earned this")).toBeVisible();
  await nav.getByRole("button", { name: /Challenges/ }).click();
  await page.getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByRole("button", { name: /A weekend well spent/ })).toBeVisible();
  await page.getByRole("button", { name: "Your account and goals" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/Your daily social screen-time goal/)
    .fill("30");
  await page.getByRole("button", { name: "Save my goals" }).click();
  await nav.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByText("30 min", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Take a 10-minute breather" }).click();
  await page.getByRole("button", { name: "Start break", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause break" })).toBeVisible();
  await page.getByRole("button", { name: "Reset break timer" }).click();
  await expect(page.getByRole("timer")).toHaveText("10:00");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("invalid invite links have a friendly safe fallback", async ({ page }) => {
  await page.goto("/join/not-a-real-token");
  await expect(page.getByRole("heading", { name: "This invitation wandered off." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Offscroll" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Join/ })).toHaveCount(0);
});
