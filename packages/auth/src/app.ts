import { verifyJWT } from "better-auth/plugins";
import {
  firstPartyAuthorizePath,
  firstPartyExchangePath,
  templarFirstPartyAudience,
} from "./first-party.ts";
import {
  type AuthService,
  type AuthUser,
  makeAuthService,
  type TemplarAuthSession,
} from "./service.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type StoredTransaction = {
  readonly state: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly expiresAt: number;
};

type StoredSession = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly admin: boolean;
  readonly createdAt: number;
  readonly expiresAt: number;
};

type FirstPartyClaims = {
  readonly sub: string;
  readonly name?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly picture?: unknown;
  readonly admin?: unknown;
};

export type AppAuthIntegrationContext = {
  readonly request: Request;
  readonly auth: AuthService;
  readonly user: AuthUser;
};

export type AppAuthIntegration = {
  readonly onAuthenticated: (context: AppAuthIntegrationContext) => Promise<void>;
};

export type TemplarAuthAppConfig = {
  readonly baseURL: string;
  readonly issuer: string;
  readonly secret: string;
  readonly basePath?: string;
  readonly sessionExpiresInSeconds?: number;
  readonly integration?: AppAuthIntegration;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
};

export type TemplarAuthApp = {
  readonly handler: (request: Request) => Promise<Response>;
  readonly auth: AuthService;
  readonly api: {
    readonly getSession: (context: {
      readonly headers: Headers;
    }) => Promise<TemplarAuthSession | null>;
  };
};

export function createTemplarAuthApp(config: TemplarAuthAppConfig): TemplarAuthApp {
  const baseURL = withoutTrailingSlash(config.baseURL);
  const basePath = normalizeBasePath(config.basePath ?? "/api/auth");
  const issuer = withoutTrailingSlash(config.issuer);
  const callbackURL = `${baseURL}${basePath}/callback`;
  const sessionExpiresInSeconds = config.sessionExpiresInSeconds ?? 60 * 60 * 24 * 30;
  const now = config.now ?? Date.now;
  const fetchImplementation = config.fetch ?? globalThis.fetch;
  const transactionCookie = "templar.auth.transaction";
  const sessionCookie = "templar.auth.session";

  async function getSession(context: {
    readonly headers: Headers;
  }): Promise<TemplarAuthSession | null> {
    const value = readCookie(context.headers, sessionCookie);
    if (value === undefined) {
      return null;
    }

    try {
      const stored = await decryptCookie<StoredSession>(value, config.secret);
      return stored.expiresAt <= now() ? null : toAuthSession(stored);
    } catch {
      return null;
    }
  }

  const api = { getSession };
  const auth = makeAuthService({ api });

  async function signIn(request: Request): Promise<Response> {
    const requestURL = new URL(request.url);
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(32);
    const transaction: StoredTransaction = {
      state,
      codeVerifier,
      returnTo: safeReturnTo(requestURL.searchParams.get("returnTo")),
      expiresAt: now() + 10 * 60 * 1_000,
    };
    const authorizationURL = new URL(firstPartyAuthorizePath, issuer);
    authorizationURL.searchParams.set("callback", callbackURL);
    authorizationURL.searchParams.set("state", state);
    authorizationURL.searchParams.set("code_challenge", await pkceChallenge(codeVerifier));

    const headers = new Headers({ location: authorizationURL.href });
    headers.append(
      "set-cookie",
      serializeCookie(
        transactionCookie,
        await encryptCookie(transaction, config.secret),
        baseURL,
        10 * 60,
      ),
    );
    return new Response(null, { status: 302, headers });
  }

  async function callback(request: Request): Promise<Response> {
    const transactionValue = readCookie(request.headers, transactionCookie);
    if (transactionValue === undefined) {
      return authErrorResponse(baseURL, "/", transactionCookie);
    }

    let transaction: StoredTransaction;
    try {
      transaction = await decryptCookie<StoredTransaction>(transactionValue, config.secret);
      if (transaction.expiresAt <= now()) {
        return authErrorResponse(baseURL, transaction.returnTo, transactionCookie);
      }
    } catch {
      return authErrorResponse(baseURL, "/", transactionCookie);
    }

    const callbackParameters = new URL(request.url).searchParams;
    const code = callbackParameters.get("code");
    const state = callbackParameters.get("state");
    if (code === null || state !== transaction.state) {
      return authErrorResponse(baseURL, transaction.returnTo, transactionCookie);
    }

    try {
      const exchangeResponse = await fetchImplementation(new URL(firstPartyExchangePath, issuer), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, codeVerifier: transaction.codeVerifier }),
      });
      if (!exchangeResponse.ok) {
        throw new Error("Authorization code exchange failed.");
      }

      const exchange = (await exchangeResponse.json()) as { readonly token?: unknown };
      if (typeof exchange.token !== "string") {
        throw new Error("Authorization code exchange returned no token.");
      }

      const claims = await verifyJWT<FirstPartyClaims>(exchange.token, {
        jwks: { remoteUrl: `${issuer}/api/auth/jwks` },
        jwt: {
          issuer,
          audience: templarFirstPartyAudience,
        },
      });
      if (claims === null || typeof claims.sub !== "string") {
        throw new Error("The auth handoff token is invalid.");
      }

      const createdAt = now();
      const stored: StoredSession = {
        id: crypto.randomUUID(),
        userId: claims.sub,
        name: stringClaim(claims.name),
        email: stringClaim(claims.email),
        emailVerified: claims.email_verified === true,
        image: nullableStringClaim(claims.picture),
        admin: claims.admin === true,
        createdAt,
        expiresAt: createdAt + sessionExpiresInSeconds * 1_000,
      };
      const sessionValue = await encryptCookie(stored, config.secret);
      const authenticatedRequest = requestWithSession(request, sessionCookie, sessionValue);

      if (config.integration !== undefined) {
        await config.integration.onAuthenticated({
          request: authenticatedRequest,
          auth,
          user: toAuthSession(stored).user,
        });
      }

      const headers = new Headers({ location: `${baseURL}${transaction.returnTo}` });
      headers.append(
        "set-cookie",
        serializeCookie(sessionCookie, sessionValue, baseURL, sessionExpiresInSeconds),
      );
      headers.append("set-cookie", clearCookie(transactionCookie, baseURL));
      return new Response(null, { status: 302, headers });
    } catch {
      return authErrorResponse(baseURL, transaction.returnTo, transactionCookie);
    }
  }

  function signOut(request: Request): Response {
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const headers = new Headers({ location: `${baseURL}${returnTo}` });
    headers.append("set-cookie", clearCookie(sessionCookie, baseURL));
    return new Response(null, { status: 302, headers });
  }

  function handler(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === `${basePath}/sign-in`) {
      return signIn(request);
    }
    if (request.method === "GET" && pathname === `${basePath}/callback`) {
      return callback(request);
    }
    if (request.method === "POST" && pathname === `${basePath}/sign-out`) {
      return Promise.resolve(signOut(request));
    }
    return Promise.resolve(new Response("Not found", { status: 404 }));
  }

  return { handler, auth, api };
}

// Compatibility alias for the initial app-side API name.
export const createTemplarAppAuth = createTemplarAuthApp;

function toAuthSession(stored: StoredSession): TemplarAuthSession {
  const createdAt = new Date(stored.createdAt);
  return {
    session: {
      id: stored.id,
      userId: stored.userId,
      token: "",
      expiresAt: new Date(stored.expiresAt),
      createdAt,
      updatedAt: createdAt,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: stored.userId,
      name: stored.name,
      email: stored.email,
      emailVerified: stored.emailVerified,
      image: stored.image,
      createdAt,
      updatedAt: createdAt,
      admin: stored.admin,
    },
  };
}

function requestWithSession(request: Request, name: string, value: string): Request {
  const headers = new Headers(request.headers);
  const existing = headers.get("cookie");
  headers.set("cookie", `${existing === null ? "" : `${existing}; `}${name}=${value}`);
  return new Request(request, { headers });
}

function authErrorResponse(baseURL: string, returnTo: string, transactionCookie: string): Response {
  const destination = new URL(`${baseURL}${safeReturnTo(returnTo)}`);
  destination.searchParams.set("error", "auth");
  const headers = new Headers({ location: destination.href });
  headers.append("set-cookie", clearCookie(transactionCookie, baseURL));
  return new Response(null, { status: 302, headers });
}

function readCookie(headers: Headers, name: string): string | undefined {
  const cookie = headers.get("cookie");
  if (cookie === null) {
    return undefined;
  }

  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function serializeCookie(
  name: string,
  value: string,
  applicationURL: string,
  maxAge: number,
): string {
  const secure = new URL(applicationURL).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(name: string, applicationURL: string): string {
  return serializeCookie(name, "", applicationURL, 0);
}

async function encryptCookie(value: unknown, secret: string): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function decryptCookie<T>(value: string, secret: string): Promise<T> {
  const [encodedIv, encodedPayload, ...extra] = value.split(".");
  if (encodedIv === undefined || encodedPayload === undefined || extra.length > 0) {
    throw new Error("Invalid auth cookie.");
  }

  const key = await encryptionKey(secret);
  const iv = fromBase64Url(encodedIv);
  const payload = fromBase64Url(encodedPayload);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    payload.buffer as ArrayBuffer,
  );
  return JSON.parse(textDecoder.decode(plaintext)) as T;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function pkceChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(codeVerifier));
  return base64Url(new Uint8Array(digest));
}

function randomBase64Url(length: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function safeReturnTo(value: string | null): string {
  if (value === null || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  const parsed = new URL(value, "https://return.invalid");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function stringClaim(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStringClaim(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeBasePath(value: string): string {
  return `/${value.split("/").filter(Boolean).join("/")}`;
}

function withoutTrailingSlash(value: string): string {
  return new URL(value).href.replace(/\/$/, "");
}
