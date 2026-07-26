import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { createTemplarAuthApp } from "../src/app.ts";
import { templarFirstPartyAudience } from "../src/first-party.ts";

test("an app verifies the central handoff through the issuer JWKS", async () => {
  const issuer = "https://auth.breli.app";
  const appOrigin = "https://app.breli.app";
  const keyId = "test-key";
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    alg: "ES256",
    kid: keyId,
    use: "sig",
  };
  const token = await new SignJWT({
    name: "Test User",
    email: "admin@example.com",
    email_verified: true,
    picture: null,
    admin: true,
  })
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setSubject("admin@example.com")
    .setIssuer(issuer)
    .setAudience(templarFirstPartyAudience)
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(privateKey);

  const requests: Array<string> = [];
  const fetchImplementation: typeof fetch = (input) => {
    const url = requestURL(input);
    requests.push(url.href);

    if (url.pathname === "/api/auth/first-party/exchange") {
      return Promise.resolve(Response.json({ token }));
    }
    if (url.pathname === "/api/auth/jwks") {
      return Promise.resolve(Response.json({ keys: [publicJwk] }));
    }
    return Promise.resolve(new Response("Not found", { status: 404 }));
  };
  const auth = createTemplarAuthApp({
    baseURL: appOrigin,
    issuer,
    secret: "test-secret-that-is-at-least-thirty-two-characters",
    fetch: fetchImplementation,
  });

  const signIn = await auth.handler(new Request(`${appOrigin}/api/auth/sign-in?returnTo=/admin`));
  const transactionCookie = cookiePair(requiredHeader(signIn.headers, "set-cookie"));
  const authorizationURL = new URL(requiredHeader(signIn.headers, "location"));
  const callbackURL = new URL(requiredSearchParameter(authorizationURL, "callback"));
  callbackURL.searchParams.set("code", "one-time-code");
  callbackURL.searchParams.set("state", requiredSearchParameter(authorizationURL, "state"));

  const callback = await auth.handler(
    new Request(callbackURL, { headers: { cookie: transactionCookie } }),
  );
  const sessionCookie = cookiePair(requiredHeader(callback.headers, "set-cookie"));
  const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });

  assert.equal(callback.status, 302);
  assert.equal(requiredHeader(callback.headers, "location"), `${appOrigin}/admin`);
  assert.equal(session?.user.email, "admin@example.com");
  assert.equal(session?.user.admin, true);
  assert.deepEqual(requests, [
    `${issuer}/api/auth/first-party/exchange`,
    `${issuer}/api/auth/jwks`,
  ]);
});

function requestURL(input: RequestInfo | URL): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (value === null) {
    throw new Error(`Expected the ${name} header.`);
  }
  return value;
}

function requiredSearchParameter(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null) {
    throw new Error(`Expected the ${name} search parameter.`);
  }
  return value;
}

function cookiePair(setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf(";"));
}
