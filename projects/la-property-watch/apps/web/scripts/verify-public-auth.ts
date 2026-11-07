import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";

// No credentials or CI session: exercise the actual public link and stop at Google.
const origin = "https://la-property-watch.breli.app";
const output = process.env["AUTH_EVIDENCE_DIR"] ?? "test/.results/production";
await test("public Google redirect and callback error visibility (not human login)", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const network: Array<{ url: string; status: number }> = [];
    let appCallback = "";
    page.on("response", (response) => {
      if (!response.request().isNavigationRequest()) {
        return;
      }
      const url = new URL(response.url());
      // Never retain query strings, OAuth state, codes, cookies, or tokens.
      network.push({ url: `${url.origin}${url.pathname}`, status: response.status() });
      if (
        url.origin === "https://auth.breli.app" &&
        url.pathname === "/api/auth/first-party/authorize"
      ) {
        appCallback = url.searchParams.get("callback") ?? "";
      }
    });
    await page.goto(origin);
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await page.waitForURL((url) => url.hostname === "accounts.google.com");
    await expect(page.getByRole("textbox", { name: "Email or phone" })).toBeVisible();
    const google = new URL(page.url());
    assert.equal(
      google.searchParams.get("redirect_uri"),
      "https://auth.breli.app/api/auth/callback/google",
    );
    assert.equal(appCallback, `${origin}/api/auth/callback`);
    assert.equal(google.searchParams.get("code_challenge_method"), "S256");
    assert(
      network.some((entry) => entry.url === `${origin}/api/auth/sign-in` && entry.status === 302),
    );
    assert(
      network.some(
        (entry) =>
          entry.url === "https://auth.breli.app/api/auth/first-party/authorize" &&
          entry.status === 302,
      ),
    );
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/google-login-boundary.png`, fullPage: true });
    await context.clearCookies();
    await page.goto(`${origin}/api/auth/callback?error=oauth`);
    await expect(page.getByRole("alert")).toContainText("missing_transaction");
    await page.screenshot({ path: `${output}/auth-failure-diagnostic.png`, fullPage: true });
    assert.equal((await context.request.get(`${origin}/api/research/data`)).status(), 401);
    const evidence = {
      network,
      appCallback,
      googleCallback: google.searchParams.get("redirect_uri"),
      pkce: "S256",
      boundary:
        "Google credential entry reached; no human login, consent, successful callback, or session tested.",
      callbackFailureVisible: true,
      signedOutDataStatus: 401,
    };
    await writeFile(`${output}/public-auth.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
});
