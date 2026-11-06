import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env["LA_PROPERTY_WATCH_URL"] ?? "https://la-property-watch.breli.app";
const secret = process.env["TEMPLAR_AUTH_SECRET"];
assert(secret, "TEMPLAR_AUTH_SECRET is required");
const origin = new URL(baseURL).origin;
assert(
  origin === "https://la-property-watch.breli.app" ||
    ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "Only the approved production origin or local test server is allowed",
);
const key = await webcrypto.subtle.importKey(
  "raw",
  createHash("sha256").update(secret).digest(),
  "AES-GCM",
  false,
  ["encrypt"],
);
async function cookie(email: string, verified: boolean) {
  const iv = randomBytes(12);
  const now = Date.now();
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        id: crypto.randomUUID(),
        userId: "production-browser-verification",
        name: "Eric Ventor",
        email,
        emailVerified: verified,
        image: null,
        admin: false,
        createdAt: now,
        expiresAt: now + 120_000,
      }),
    ),
  );
  return {
    name: "templar.auth.session",
    value: `${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`,
    url: origin,
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
  };
}
await test("deployed browser acceptance", { timeout: 180_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const anonymous = await browser.newContext();
    const publicPage = await anonymous.newPage();
    await publicPage.goto(origin);
    await expect(publicPage.getByRole("link", { name: "Continue with Google" })).toBeVisible();
    assert.equal((await anonymous.request.get(`${origin}/api/research/data`)).status(), 401);
    assert.equal((await anonymous.request.get(`${origin}/api/research/export.csv`)).status(), 401);
    await anonymous.close();
    for (const identity of [
      { email: "not-eric@example.invalid", verified: true },
      { email: "ericventor97@gmail.com", verified: false },
    ]) {
      const denied = await browser.newContext();
      await denied.addCookies([await cookie(identity.email, identity.verified)]);
      assert.equal((await denied.request.get(`${origin}/api/research/data`)).status(), 403);
      assert.equal((await denied.request.get(`${origin}/api/research/export.csv`)).status(), 403);
      await denied.close();
    }
    await mkdir("test/.results/production", { recursive: true });
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([
        await cookie(
          viewport.width === 1440 ? "ericventor97@gmail.com" : "Rhwcreative@gmail.com",
          true,
        ),
      ]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await expect(page.getByRole("heading", { name: "Property observations" })).toBeVisible();
      const response = await context.request.get(`${origin}/api/research/data`);
      assert.equal(response.status(), 200);
      const data = (await response.json()) as {
        records: Array<{
          signalType: string;
          sourceRecordId: string;
          sourceUrl: string;
        }>;
      };
      const record = data.records.find(
        (candidate) => candidate.signalType === "power_to_sell" && candidate.sourceRecordId,
      );
      assert(
        record?.sourceRecordId,
        "Need a persisted real power-to-sell record for UI verification",
      );
      await page.getByLabel("Search records").fill(record.sourceRecordId);
      await page.getByRole("button").filter({ hasText: record.sourceRecordId }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("No auction date is represented by this signal."),
      ).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Open source", exact: true })).toHaveAttribute(
        "href",
        record.sourceUrl,
      );
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "Horizontal viewport overflow",
      );
      await page.screenshot({
        path: `test/.results/production/detail-${viewport.width}.png`,
      });
      await page.getByRole("button", { name: "Close details" }).click();
      await page.getByLabel("Search records").fill("");
      await page.screenshot({
        path: `test/.results/production/dashboard-${viewport.width}.png`,
      });
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
      assert.deepEqual(errors, [], "Unexpected browser JavaScript errors");
      await context.close();
    }
    console.log(
      "Production browser checks passed: anonymous/denied access, authorized desktop/mobile, real persisted record search/details/source link, no horizontal overflow, sign-out, no JavaScript errors.",
    );
  } finally {
    await browser.close();
  }
});
