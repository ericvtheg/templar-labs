import { expect, test } from "@playwright/test";
import { crew, fieldNotes, groom, missions } from "../../src/lib/curriculum.ts";
import { grade } from "../../src/lib/learning.ts";
import type { TripData } from "../../src/lib/types.ts";

test("real signed-out endpoint cannot return crew data", async ({ page, request }) => {
  const response = await request.get("/api/trip/state");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("Rolo");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Continue with Google/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Flag of China" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("invite-gate.png"), fullPage: true });
});

test("beginner mission, honest voice fallback, crew board, and offline export", async ({
  page,
}) => {
  const data: TripData = {
    user: { id: "gavin", name: "Gavin" },
    groom,
    crew,
    missions,
    fieldNotes,
    completed: [],
    mastery: [],
    board: [{ id: "gavin", name: "Gavin", completed: 0 }],
    activity: [],
  };
  // Only this browser test intercepts authenticated data. There is no app-side preview/auth bypass.
  await page.route("**/api/trip/state", (route) => route.fulfill({ json: data }));
  await page.route("**/api/trip/answer", async (route) => {
    const body = route.request().postDataJSON() as {
      missionId: string;
      task: number;
      answer: string;
    };
    await route.fulfill({
      json: { correct: grade(body.missionId, body.task, body.answer), completed: false },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start from absolute zero/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("missions.png"), fullPage: true });
  await page.getByRole("button", { name: /Start from absolute zero/ }).click();
  await expect(page.getByText("CHINESE, FROM LITERALLY ZERO")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("first-lesson.png"), fullPage: true });
  await page.getByRole("button", { name: "▶ Listen", exact: true }).click();
  // Headless Chromium may not have system voices. The lesson must remain usable either way.
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: /I’ve said it. Next/ }).click();
  }
  await expect(page.getByText("BEFORE THE SIGN CHECK")).toBeVisible();
  await page.getByRole("button", { name: /Try the mission check/ }).click();
  await expect(page.getByText("RECOGNITION CHECK")).toBeVisible();
  await page.getByRole("button", { name: /你好/ }).click();
  await expect(page.getByText("That’s the one. 好!")).toBeVisible();
  await page.getByRole("button", { name: "Next check →", exact: true }).click();
  await expect(page.getByText("LISTENING CHECK")).toBeVisible();
  await page.getByRole("button", { name: "No audio? Show text hint" }).click();
  await expect(page.getByText("谢谢。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /The boys/, exact: false }).click();
  await expect(page.getByText(/Quiet in here/)).toBeVisible();
  await page.getByRole("button", { name: /Pocket guide/ }).click();
  await expect(page.getByRole("link", { name: /120 Ambulance/ })).toHaveAttribute(
    "href",
    "tel:120",
  );
  await page.getByText("Save a text-only offline guide", { exact: true }).click();
  await page
    .getByLabel("Hotel / meeting point in Chinese (included only in your download)")
    .fill('北京 <script>alert("not executable")</script>');
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download offline pocket guide/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("china-pocket-guide.html");
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error("Missing guide download");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const html = Buffer.concat(chunks).toString("utf8");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("请叫救护车");
  expect(html).not.toContain("Gavin");
  await page.getByRole("searchbox").fill("ambulance");
  await page.getByRole("button", { name: /Please call an ambulance/ }).click();
  await expect(page.locator(".show-card")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("pocket-guide.png"), fullPage: true });
});
