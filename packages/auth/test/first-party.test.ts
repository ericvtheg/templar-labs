import assert from "node:assert/strict";
import { test } from "node:test";
import { firstPartyAllowedRootDomains } from "../src/allow-list.ts";
import { createTemplarFirstPartyHandler, isAllowedFirstPartyCallback } from "../src/first-party.ts";
import type { AuthSession } from "../src/service.ts";

test("production auth accepts only standard callbacks on first-party domains", () => {
  const auth = new URL("https://auth.breli.app");

  for (const domain of firstPartyAllowedRootDomains) {
    assert.equal(
      isAllowedFirstPartyCallback(new URL(`https://${domain}/api/auth/callback`), auth),
      true,
    );
    assert.equal(
      isAllowedFirstPartyCallback(new URL(`https://app.${domain}/api/auth/callback`), auth),
      true,
    );
    assert.equal(
      isAllowedFirstPartyCallback(new URL(`https://not-${domain}/api/auth/callback`), auth),
      false,
    );
  }
  assert.equal(
    isAllowedFirstPartyCallback(new URL("https://untrusted.invalid/api/auth/callback"), auth),
    false,
  );
  assert.equal(
    isAllowedFirstPartyCallback(new URL("https://emmaand.ericventor.com/callback"), auth),
    false,
  );
  assert.equal(
    isAllowedFirstPartyCallback(
      new URL("https://emmaand.ericventor.com/api/auth/callback?next=/admin"),
      auth,
    ),
    false,
  );
});

test("first-party auth accepts loopback callbacks for local applications", () => {
  const callback = new URL("http://localhost:5180/api/auth/callback");

  assert.equal(isAllowedFirstPartyCallback(callback, new URL("http://localhost:5181")), true);
  assert.equal(isAllowedFirstPartyCallback(callback, new URL("https://auth.breli.app")), true);
  assert.equal(
    isAllowedFirstPartyCallback(
      new URL("https://localhost:5180/api/auth/callback"),
      new URL("https://auth.breli.app"),
    ),
    false,
  );
  assert.equal(
    isAllowedFirstPartyCallback(
      new URL("http://untrusted.invalid/api/auth/callback"),
      new URL("https://auth.breli.app"),
    ),
    false,
  );
});

test("an unauthenticated authorization starts Google without a central sign-in page", async () => {
  let socialInput:
    | {
        readonly callbackURL: string;
        readonly errorCallbackURL: string;
        readonly provider: string;
      }
    | undefined;
  const handler = createTemplarFirstPartyHandler({
    auth: {
      api: {
        getSession: async () => null,
        signInSocial: ({
          body,
        }: {
          readonly body: {
            readonly callbackURL: string;
            readonly errorCallbackURL: string;
            readonly provider: string;
          };
        }) => {
          socialInput = body;
          return Promise.resolve({
            headers: new Headers({ "set-cookie": "better-auth.state=test; HttpOnly" }),
            response: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=provider-state" },
          });
        },
      },
      handler: async () => new Response("fallback"),
    },
    db: fakeD1(new Map()),
    baseURL: "https://auth.breli.app",
    adminEmails: new Set(),
    signToken: async () => "unused",
  });
  const authorizeURL = new URL("https://auth.breli.app/api/auth/first-party/authorize");
  authorizeURL.searchParams.set("callback", "https://app.breli.app/api/auth/callback");
  authorizeURL.searchParams.set("state", "s".repeat(43));
  authorizeURL.searchParams.set("code_challenge", "c".repeat(43));

  const response = await handler(new Request(authorizeURL));

  assert.equal(response.status, 302);
  assert.match(requiredHeader(response.headers, "location"), /^https:\/\/accounts\.google\.com\//);
  assert.match(requiredHeader(response.headers, "set-cookie"), /better-auth\.state=test/);
  assert.equal(socialInput?.provider, "google");
  assert.equal(socialInput?.callbackURL, `${authorizeURL.pathname}${authorizeURL.search}`);
  assert.equal(
    socialInput?.errorCallbackURL,
    `https://app.breli.app/api/auth/callback?error=oauth&state=${"s".repeat(43)}`,
  );
});

test("authorization codes are PKCE-bound, single-use, and sign the global admin claim", async () => {
  const records = new Map<string, { readonly value: string; readonly expiresAt: number }>();
  const db = fakeD1(records);
  let signedPayload: { readonly admin?: unknown; readonly sub?: unknown } | undefined;
  const handler = createTemplarFirstPartyHandler({
    auth: {
      api: {
        getSession: async () => testSession("canonical-user-id"),
        signInSocial: () =>
          Promise.reject(new Error("An authenticated request must not restart provider sign-in.")),
      },
      handler: async () => new Response("fallback"),
    },
    db,
    baseURL: "https://auth.breli.app",
    adminEmails: new Set(["TEST@EXAMPLE.COM"]),
    signToken: (payload) => {
      const { admin, sub } = payload;
      signedPayload = { admin, sub };
      return Promise.resolve("signed-token");
    },
    now: () => 10_000,
  });
  const verifier = "v".repeat(43);
  const challenge = await sha256Base64Url(verifier);
  const state = "s".repeat(43);
  const authorizeURL = new URL("https://auth.breli.app/api/auth/first-party/authorize");
  authorizeURL.searchParams.set("callback", "https://app.breli.app/api/auth/callback");
  authorizeURL.searchParams.set("state", state);
  authorizeURL.searchParams.set("code_challenge", challenge);

  const authorization = await handler(new Request(authorizeURL));
  const callback = new URL(requiredHeader(authorization.headers, "location"));
  const code = callback.searchParams.get("code");

  assert.equal(authorization.status, 302);
  assert.equal(callback.searchParams.get("state"), state);
  assert.ok(code !== null);
  assert.doesNotThrow(() => authorization.headers.set("x-tanstack-start", "merged"));

  const exchangeRequest = () =>
    new Request("https://auth.breli.app/api/auth/first-party/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });
  const exchanged = await handler(exchangeRequest());
  const replayed = await handler(exchangeRequest());

  assert.equal(exchanged.status, 200);
  assert.deepEqual(await exchanged.json(), { token: "signed-token" });
  assert.equal(replayed.status, 400);
  assert.equal(signedPayload?.sub, "canonical-user-id");
  assert.equal(signedPayload?.admin, true);
});

function fakeD1(
  records: Map<string, { readonly value: string; readonly expiresAt: number }>,
): D1Database {
  return {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => ({
        run: () => {
          if (query.startsWith("INSERT INTO verification")) {
            records.set(String(values[1]), {
              value: String(values[2]),
              expiresAt: Number(values[3]),
            });
          }
          return Promise.resolve({ success: true });
        },
        first: () => {
          if (query.startsWith("DELETE FROM verification")) {
            const identifier = String(values[0]);
            const record = records.get(identifier);
            if (record === undefined || record.expiresAt <= Number(values[1])) {
              return Promise.resolve(null);
            }
            records.delete(identifier);
            return Promise.resolve({ value: record.value });
          }
          if (query.startsWith("SELECT id, name, email")) {
            return Promise.resolve({
              id: String(values[0]),
              name: "Test User",
              email: "test@example.com",
              emailVerified: 1,
              image: null,
            });
          }
          return Promise.resolve(null);
        },
      }),
    }),
  } as unknown as D1Database;
}

function testSession(userId: string): AuthSession {
  const now = new Date(0);
  return {
    session: {
      id: "session-id",
      userId,
      token: "token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (value === null) {
    throw new Error(`Missing ${name} header.`);
  }
  return value;
}
