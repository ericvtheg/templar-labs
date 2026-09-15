import { expect, test } from "@playwright/test";
import { crew, fieldNotes, groom, missions } from "../../src/lib/curriculum.ts";
import { grade } from "../../src/lib/learning.ts";
import type { TripData } from "../../src/lib/types.ts";

test("serves browser and home-screen icons without requiring sign-in", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('head link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
  const [svg, ico, png, apple] = await Promise.all([
    request.get("/favicon.svg"),
    request.get("/favicon.ico"),
    request.get("/favicon-32x32.png"),
    request.get("/apple-touch-icon.png"),
  ]);
  for (const response of [svg, ico, png, apple]) {
    expect(response.status()).toBe(200);
  }
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svg.text()).toContain("#ffde00");
  const icoBytes = await ico.body();
  expect(icoBytes.readUInt16LE(2)).toBe(1);
  expect(icoBytes.readUInt16LE(4)).toBe(3);
  const [pngBytes, appleBytes] = await Promise.all([png.body(), apple.body()]);
  expect(pngBytes.readUInt32BE(16)).toBe(32);
  expect(pngBytes.readUInt32BE(20)).toBe(32);
  expect(appleBytes.readUInt32BE(16)).toBe(180);
  expect(appleBytes.readUInt32BE(20)).toBe(180);
});

test("a tap can start delayed audio playback, including Safari byte-range requests", async ({
  page,
}) => {
  await page.route("**/api/trip/state", (route) =>
    route.fulfill({
      json: {
        user: { id: "gavin", name: "Gavin" },
        groom,
        crew,
        missions,
        fieldNotes,
        completed: [],
        mastery: [],
        board: [],
        activity: [],
      },
    }),
  );
  // Original silent WAV fixture: no live API usage and no person’s recording.
  const wav = Buffer.alloc(96044);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(96000, 40);
  await page.route("**/api/trip/speech?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const match = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
    await route.fulfill({
      status: match ? 206 : 200,
      headers: {
        "content-type": "audio/wav",
        "accept-ranges": "bytes",
        ...(match ? { "content-range": `bytes ${start}-${end}/${wav.length}` } : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Start from absolute zero/ }).click();
  await page.getByRole("button", { name: /Let’s begin/ }).click();
  await page.getByRole("button", { name: /Next: hear it/ }).click();
  await page.getByRole("button", { name: "▶ Listen", exact: true }).click();
  await expect(page.getByText("Speaking Mandarin · ElevenLabs")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "■ Stop audio" }).click();
  await expect(page.getByText(/ElevenLabs audio couldn’t play/)).toHaveCount(0);
});

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
    const correct = grade(body.missionId, body.task, body.answer);
    if (correct) {
      data.mastery.push({
        mission_id: body.missionId,
        task: body.task,
        level: 1,
        due: Date.now() + 86400000,
      });
    }
    await route.fulfill({ json: { correct, completed: false } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start from absolute zero/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("missions.png"), fullPage: true });
  await page.getByRole("button", { name: /Start from absolute zero/ }).click();
  await expect(page.getByText("Your first Chinese words.")).toBeVisible();
  await expect(page.locator(".experience-nav, .session-reveal")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await page.getByRole("button", { name: /Let’s begin/ }).click();
  await expect(page.getByText("CHINESE, FROM LITERALLY ZERO")).toBeVisible();
  await expect(page.getByRole("button", { name: /Next: hear it/ })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath("first-lesson.png"), fullPage: true });
  await page.getByRole("button", { name: /Next: hear it/ }).click();
  await page.route("**/api/trip/speech?**", (route) =>
    route.fulfill({ status: 503, json: { error: "Test unavailable voice" } }),
  );
  await page.getByRole("button", { name: "▶ Listen", exact: true }).click();
  await expect(page.getByText(/ElevenLabs audio couldn’t play/)).toBeVisible();
  await page.getByRole("button", { name: /Next: tones/ }).click();
  await expect(page.getByText("Your voice changes the word.")).toBeVisible();
  await page.getByRole("button", { name: /Next: try it/ }).click();
  await expect(page.getByRole("button", { name: /Use your first words/ })).toBeDisabled();
  await page.getByRole("button", { name: "你", exact: true }).click();
  await page.getByRole("button", { name: /Use your first words/ }).click();
  for (const [index, phrase] of (missions[0]?.phrases ?? []).entries()) {
    await expect(page.locator(".phrase-encounter")).toHaveCount(1);
    await expect(page.locator(".encounter-choices")).toHaveCount(0);
    if (index % 3 === 0) {
      await page.getByRole("button", { name: "Flip phrase card" }).click();
      await page.getByRole("button", { name: /Try it from memory/ }).click();
      await page
        .locator(".encounter-choices")
        .getByRole("button", { name: `${phrase.hanzi} ${phrase.pinyin}`, exact: true })
        .click();
    } else if (index % 3 === 1) {
      await page.getByRole("button", { name: /Try it by ear/ }).click();
      await page.getByRole("button", { name: phrase.english, exact: true }).click();
    } else {
      await page.getByRole("button", { name: /My turn to say it/ }).click();
      await page.getByLabel(/Check what it heard/).fill(phrase.pinyin);
      await page.getByRole("button", { name: /Check my phrase/ }).click();
    }
    await expect(page.getByText("That gets the message across.")).toBeVisible();
    await page.getByRole("button", { name: /What happens next/ }).click();
  }
  await page.route("**/api/trip/match", (route) => {
    data.completed = ["basics"];
    return route.fulfill({ json: { correct: true, completed: true } });
  });
  await page.screenshot({ path: test.info().outputPath("sign-wall.png"), fullPage: true });
  await page.getByRole("button", { name: /Hide the English/ }).click();
  for (const card of missions[0]?.matches ?? []) {
    await page.getByRole("button", { name: card.hanzi, exact: true }).click();
    await page.getByRole("button", { name: card.english, exact: true }).click();
  }
  await expect(page.getByText(/Sign encounter saved/)).toBeVisible();
  await page.route("**/api/trip/coach", async (route) => {
    const body = route.request().postDataJSON();
    const target = { id: "phrase-0", kind: "phrase", ...missions[0]?.phrases[0] };
    await route.fulfill({
      json:
        body.action === "start"
          ? {
              id: "test-scene",
              scene:
                "Eric volunteered Gavin as the hotel translator. Say hello to the receptionist.",
              prompt: "What do you say?",
              source: "ai",
              target,
            }
          : {
              correct: true,
              feedback: "Ni hao gets you through the door. Now say it out loud.",
              source: "ai",
              target,
            },
    });
  });
  await page.getByRole("button", { name: /What happens next/ }).click();
  await page.getByRole("button", { name: /Deal me a situation/ }).click();
  await page.getByLabel("What do you say?").fill("ni hao");
  await page.getByRole("button", { name: "Send →", exact: true }).click();
  await expect(page.getByText(/Ni hao gets you through/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("chaos-coach.png"), fullPage: true });
  await page.getByRole("button", { name: /What happens next/ }).click();
  await expect(page.getByRole("heading", { name: "Passport stamped." })).toBeVisible();
  await expect(page.locator(".session-reveal")).toHaveCount(1);
  await expect(page.locator(".video-lab")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("session-payoff.png"), fullPage: true });
  await page.getByRole("button", { name: /Back to your trip/ }).click();
  await expect(page.getByRole("button", { name: /Pick up where you left off/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: /The boys/ })
    .click();
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
