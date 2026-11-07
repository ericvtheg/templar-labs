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
      await expect(page.getByRole("heading", { name: /Find distress earlier/ })).toBeVisible();
      const params = new URLSearchParams({
        jurisdiction: "norfolk-va",
        signal: "code_violation",
      });
      const response = await context.request.get(`${origin}/api/research/data?${params}`);
      assert.equal(response.status(), 200);
      const data = (await response.json()) as {
        properties: Array<{
          propertyKey: string;
          parcelId: string | null;
          address: string | null;
          score: number;
        }>;
        page: { total: number };
      };
      assert(
        data.page.total > 0,
        "Need a persisted ranked Norfolk code property for UI verification",
      );
      const property = data.properties[0];
      assert(property, "Ranked property page was empty");
      const detailResponse = await context.request.get(
        `${origin}/api/research/properties/${encodeURIComponent(property.propertyKey)}?evidencePage=1&evidencePageSize=10`,
      );
      assert.equal(detailResponse.status(), 200);
      const detail = (await detailResponse.json()) as {
        evidence: Array<{ sourceUrl: string; snapshotPresence: string }>;
        evidenceTotal: number;
      };
      assert(detail.evidence[0]?.sourceUrl, "Ranked property evidence lacked source provenance");
      assert.equal(detail.evidence[0]?.snapshotPresence, "present");
      const searchIdentity = property.parcelId ?? property.address ?? property.propertyKey;
      await page.getByLabel("Search properties").fill(searchIdentity);
      const filteredResponse = page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return (
          url.pathname === "/api/research/data" &&
          url.searchParams.get("query") === searchIdentity &&
          candidate.ok()
        );
      });
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await filteredResponse;
      const exactPropertyRow = page.locator(
        `.property-row-wrap[data-property-key="${property.propertyKey}"] .property-row`,
      );
      await expect(exactPropertyRow).toBeVisible();
      await expect(exactPropertyRow).toContainText(
        property.parcelId ?? property.address ?? property.propertyKey,
      );
      const briefLoaded = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname ===
            `/api/research/deal-briefs/${encodeURIComponent(property.propertyKey)}` &&
          candidate.ok(),
      );
      const scenariosLoaded = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname ===
            `/api/research/scenarios/${encodeURIComponent(property.propertyKey)}` && candidate.ok(),
      );
      await exactPropertyRow.click();
      await Promise.all([briefLoaded, scenariosLoaded]);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(property.propertyKey, { exact: true })).toBeVisible();
      await expect(dialog.getByText("Present in latest source observation").first()).toBeVisible();
      await expect(dialog.getByText(/deterministic prioritization/)).toBeVisible();
      await expect(
        dialog.getByRole("link", { name: "Open source evidence", exact: true }).first(),
      ).toHaveAttribute("href", detail.evidence[0].sourceUrl);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "Horizontal viewport overflow",
      );
      const dimensions = dialog.getByRole("region", {
        name: "Qualification dimensions",
        exact: true,
      });
      await expect(dimensions).toBeVisible();
      await expect(dimensions).toContainText("Distress strength");
      await expect(dimensions).toContainText("Evidence confidence");
      await expect(dimensions).toContainText("Buying fit");
      await expect(dialog.getByText("Loading source-backed brief…", { exact: true })).toHaveCount(
        0,
      );
      await page.screenshot({ path: `test/.results/production/detail-${viewport.width}.png` });
      for (const [name, artifact] of [
        ["Investigation assessment", "investigation"],
        ["Partner feedback and outcomes", "feedback"],
        ["Deal economics scenarios", "scenarios"],
      ] as const) {
        const section = dialog.getByRole("region", { name, exact: true });
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
        await page.screenshot({
          path: `test/.results/production/${artifact}-${viewport.width}.png`,
        });
      }
      const evidenceCard = dialog.locator(".evidence-card").first();
      await evidenceCard.scrollIntoViewIfNeeded();
      await expect(evidenceCard.getByText("Source updated", { exact: true })).toBeVisible();
      await expect(evidenceCard.getByText("Evidence total", { exact: true })).toBeVisible();
      await page.screenshot({ path: `test/.results/production/evidence-${viewport.width}.png` });
      await page.getByRole("button", { name: "Close details" }).click();
      await page.getByLabel("Search properties").fill("");
      const clearedResponse = page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return url.pathname === "/api/research/data" && url.searchParams.get("query") === "";
      });
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await clearedResponse;
      const marketResponse = page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return (
          url.pathname === "/api/research/data" &&
          url.searchParams.get("jurisdiction") === "norfolk-va"
        );
      });
      await page.getByLabel("Market jurisdiction").selectOption("norfolk-va");
      await marketResponse;
      const signalResponse = page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return (
          url.pathname === "/api/research/data" &&
          url.searchParams.get("jurisdiction") === "norfolk-va" &&
          url.searchParams.get("signal") === "code_violation" &&
          candidate.ok()
        );
      });
      await page.getByLabel("Signal type").selectOption("code_violation");
      await signalResponse;
      await expect(page.locator(".property-row").first()).toBeVisible();
      await expect(page.locator(".property-row").first()).toContainText("Active code violation");
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: /Export evidence CSV/ }).click();
      const download = await downloadPromise;
      assert.equal(await download.failure(), null, "CSV download failed");
      await page.screenshot({ path: `test/.results/production/dashboard-${viewport.width}.png` });
      const workflowNav = page.getByRole("navigation", { name: "Partner workflow" });
      for (const [name, workspace] of [
        ["Changes", "activity workspace"],
        ["Pipeline", "pipeline workspace"],
        ["Buy boxes", "buyboxes workspace"],
      ] as const) {
        await workflowNav.getByRole("button", { name, exact: true }).click();
        await expect(page.getByRole("region", { name: workspace, exact: true })).toBeVisible();
      }
      const benchmarksLoaded = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === "/api/research/benchmarks" && candidate.ok(),
      );
      await workflowNav.getByRole("button", { name: "Blind benchmarks", exact: true }).click();
      await benchmarksLoaded;
      await expect(
        page.getByRole("heading", { name: "Licensed shortlist benchmark" }),
      ).toBeVisible();
      await page.screenshot({ path: `test/.results/production/benchmarks-${viewport.width}.png` });
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
      assert.deepEqual(errors, [], "Unexpected browser JavaScript errors");
      await context.close();
    }
    console.log(
      "Production browser checks passed: anonymous/denied access, authorized desktop/mobile, ranked search, loaded qualification/investigation/feedback/scenario sections, Changes/Pipeline/Buy boxes/Blind benchmarks workspaces, exact current-first provenance, no horizontal overflow, sign-out, and no JavaScript errors.",
    );
  } finally {
    await browser.close();
  }
});
