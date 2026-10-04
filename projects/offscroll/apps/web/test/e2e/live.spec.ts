import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInLocally } from "./auth-fixture.ts";

test("authenticated circles really share invitations and check-ins without exposing outsider data", async ({
  page,
  browser,
}) => {
  const suffix = randomUUID();
  await signInLocally(page.context(), { id: `avery-${suffix}`, name: "Avery Walker" });
  const friend = await browser.newContext();
  const outsider = await browser.newContext();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hey Avery, welcome back." })).toBeVisible();
    await expect(page.getByText("Take a look around.")).not.toBeVisible();
    await page.getByRole("button", { name: "Create challenge", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Give it a name").fill("Real friends, real time");
    await page
      .getByRole("dialog")
      .getByLabel("What are you playing for?")
      .fill("Coffee and a hike");
    await page.getByRole("dialog").getByRole("button", { name: "Let’s do this" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /Real friends, real time/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Invite friends" }).click();
    const url = await page.getByRole("dialog").getByLabel("Private invitation link").inputValue();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:5188\/join\/[a-f0-9]{48}$/);
    await page.keyboard.press("Escape");

    const friendPage = await friend.newPage();
    await friendPage.goto(url);
    await expect(
      friendPage.getByRole("heading", { name: "You’re invited to unplug." }),
    ).toBeVisible();
    await expect(friendPage.getByRole("link", { name: "Join with Breli" })).toHaveAttribute(
      "href",
      /returnTo=%2Fjoin%2F/,
    );
    await signInLocally(friend, { id: `morgan-${suffix}`, name: "Morgan Reed" });
    await friendPage.reload();
    await friendPage.getByRole("button", { name: "I’m in. Let’s do this." }).click();
    await expect(
      friendPage.getByRole("heading", { name: "Hey Morgan, welcome back." }),
    ).toBeVisible();
    await friendPage.getByRole("button", { name: "Log screen time", exact: true }).click();
    await friendPage.getByRole("dialog").getByLabel("Instagram", { exact: true }).fill("12");
    await friendPage
      .getByRole("dialog")
      .getByLabel(/What did you do instead/)
      .fill("A hike with Avery, not a feed.");
    await friendPage.getByRole("dialog").getByRole("button", { name: "Save check-in" }).click();
    await expect(friendPage.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    await expect(page.getByText("A hike with Avery, not a feed.")).toBeVisible();
    await page.getByRole("button", { name: /Real friends, real time/ }).click();
    await expect(page.getByRole("dialog").getByText("Morgan", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("0/0 days · unranked")).toHaveCount(2);
    await page.keyboard.press("Escape");

    await signInLocally(outsider, { id: `private-${suffix}`, name: "Casey Green" });
    const outsiderPage = await outsider.newPage();
    await outsiderPage.goto("http://127.0.0.1:5188/");
    await expect(
      outsiderPage.getByRole("heading", { name: "Hey Casey, welcome back." }),
    ).toBeVisible();
    await expect(outsiderPage.getByText("A hike with Avery, not a feed.")).not.toBeVisible();
    await expect(outsiderPage.getByRole("button", { name: /Real friends, real time/ })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Your account and goals" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Take a look around.")).toBeVisible();
  } finally {
    await friend.close();
    await outsider.close();
  }
});

test("Breli sign-in preserves the invitation return path and rejects forged sessions", async ({
  page,
}) => {
  const response = await page.request.get("/api/auth/sign-in?returnTo=%2Fjoin%2Fabc", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  const location = new URL(response.headers()["location"] ?? "");
  expect(location.origin).toBe("https://auth.breli.app");
  expect(location.searchParams.get("callback")).toBe("http://127.0.0.1:5188/api/auth/callback");
  await page.context().addCookies([
    {
      name: "templar.auth.session",
      value: "forged.cookie",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(page.getByText("Take a look around.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hey Jamie, welcome back." })).toBeVisible();
});
