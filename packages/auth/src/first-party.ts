import { firstPartyAllowedRootDomains } from "./allow-list.ts";
import type { TemplarAuthSession } from "./service.ts";

export const templarFirstPartyAudience = "templar-first-party";
export const firstPartyAuthorizePath = "/api/auth/first-party/authorize";
export const firstPartyExchangePath = "/api/auth/first-party/exchange";

const handoffLifetimeMilliseconds = 60_000;

type FirstPartyAuthApi = {
  readonly getSession: (input: { readonly headers: Headers }) => Promise<TemplarAuthSession | null>;
  readonly signInSocial: (input: {
    readonly body: {
      readonly provider: "google";
      readonly callbackURL: string;
      readonly errorCallbackURL: string;
    };
    readonly headers: Headers;
    readonly returnHeaders: true;
  }) => Promise<{
    readonly headers: Headers;
    readonly response: { readonly url?: string };
  }>;
};

type FirstPartyAuthServer = {
  readonly api: FirstPartyAuthApi;
  readonly handler: (request: Request) => Promise<Response>;
};

type AuthorizationRecord = {
  readonly userId: string;
  readonly codeChallenge: string;
};

type CanonicalUserRow = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: number;
  readonly image: string | null;
};

export type TemplarFirstPartyServerConfig = {
  readonly auth: FirstPartyAuthServer;
  readonly db: D1Database;
  readonly baseURL: string;
  readonly adminEmails: ReadonlySet<string>;
  readonly signToken: (payload: Record<string, unknown>) => Promise<string>;
  readonly now?: () => number;
};

export function createTemplarFirstPartyHandler(
  config: TemplarFirstPartyServerConfig,
): (request: Request) => Promise<Response> {
  const baseURL = new URL(config.baseURL);
  const now = config.now ?? Date.now;

  return (request) => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === firstPartyAuthorizePath) {
      return authorize(request, config, baseURL, now);
    }

    if (request.method === "POST" && url.pathname === firstPartyExchangePath) {
      return exchange(request, config, baseURL, now);
    }

    if (
      url.pathname === "/api/auth/sign-jwt" ||
      url.pathname === "/api/auth/verify-jwt" ||
      url.pathname === "/api/auth/token"
    ) {
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }

    return config.auth.handler(request);
  };
}

async function authorize(
  request: Request,
  config: TemplarFirstPartyServerConfig,
  baseURL: URL,
  now: () => number,
): Promise<Response> {
  const url = new URL(request.url);
  const callbackValue = url.searchParams.get("callback");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");

  if (
    callbackValue === null ||
    state === null ||
    state.length < 32 ||
    state.length > 256 ||
    codeChallenge === null ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  let callback: URL;
  try {
    callback = new URL(callbackValue);
  } catch {
    return Response.json({ error: "invalid_callback" }, { status: 400 });
  }

  if (!isAllowedFirstPartyCallback(callback, baseURL)) {
    return Response.json({ error: "invalid_callback" }, { status: 400 });
  }

  const session = await config.auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return beginGoogleSignIn(request, config, url, callback, state);
  }

  const code = randomBase64Url(32);
  const identifier = await authorizationIdentifier(code);
  const createdAt = now();
  const record: AuthorizationRecord = {
    userId: session.user.id,
    codeChallenge,
  };

  await config.db
    .prepare(
      "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      identifier,
      JSON.stringify(record),
      createdAt + handoffLifetimeMilliseconds,
      createdAt,
      createdAt,
    )
    .run();

  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  return Response.redirect(callback.href, 302);
}

async function beginGoogleSignIn(
  request: Request,
  config: TemplarFirstPartyServerConfig,
  authorizeURL: URL,
  callback: URL,
  state: string,
): Promise<Response> {
  const errorCallbackURL = new URL(callback);
  errorCallbackURL.searchParams.set("error", "oauth");
  errorCallbackURL.searchParams.set("state", state);

  const signIn = await config.auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: `${authorizeURL.pathname}${authorizeURL.search}`,
      errorCallbackURL: errorCallbackURL.href,
    },
    headers: request.headers,
    returnHeaders: true,
  });

  if (typeof signIn.response.url !== "string") {
    return Response.json({ error: "provider_unavailable" }, { status: 502 });
  }

  const headers = new Headers(signIn.headers);
  const headersWithSetCookie = signIn.headers as Headers & {
    readonly getSetCookie?: () => Array<string>;
  };
  const stateCookies = new Set(
    headersWithSetCookie.getSetCookie?.() ??
      [signIn.headers.get("set-cookie")].filter((cookie): cookie is string => cookie !== null),
  );
  headers.delete("set-cookie");
  for (const cookie of stateCookies) {
    headers.append("set-cookie", cookie);
  }
  headers.set("location", signIn.response.url);
  headers.delete("content-length");
  headers.delete("content-type");
  return new Response(null, { status: 302, headers });
}

async function exchange(
  request: Request,
  config: TemplarFirstPartyServerConfig,
  baseURL: URL,
  now: () => number,
): Promise<Response> {
  const body = await readExchangeBody(request);
  if (body === null) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const identifier = await authorizationIdentifier(body.code);
  const consumed = await config.db
    .prepare("DELETE FROM verification WHERE identifier = ? AND expires_at > ? RETURNING value")
    .bind(identifier, now())
    .first<{ readonly value: string }>();

  if (consumed === null) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }

  let record: AuthorizationRecord;
  try {
    record = JSON.parse(consumed.value) as AuthorizationRecord;
  } catch {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }

  if ((await pkceChallenge(body.codeVerifier)) !== record.codeChallenge) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }

  const user = await config.db
    .prepare(
      "SELECT id, name, email, email_verified AS emailVerified, image FROM user WHERE id = ?",
    )
    .bind(record.userId)
    .first<CanonicalUserRow>();

  if (user === null) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }

  const token = await config.signToken({
    sub: user.id,
    name: user.name,
    email: user.email,
    email_verified: user.emailVerified === 1,
    picture: user.image,
    admin: includesEmail(config.adminEmails, user.email),
    aud: templarFirstPartyAudience,
    iss: baseURL.origin,
    iat: Math.floor(now() / 1_000),
    exp: Math.floor((now() + handoffLifetimeMilliseconds) / 1_000),
  });

  return Response.json(
    { token },
    {
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );
}

export function isAllowedFirstPartyCallback(callback: URL, authBaseURL: URL): boolean {
  if (
    callback.username !== "" ||
    callback.password !== "" ||
    callback.pathname !== "/api/auth/callback" ||
    callback.search !== "" ||
    callback.hash !== ""
  ) {
    return false;
  }

  if (isLoopbackHostname(authBaseURL.hostname)) {
    return callback.protocol === "http:" && isLoopbackHostname(callback.hostname);
  }

  return (
    callback.protocol === "https:" &&
    firstPartyAllowedRootDomains.some(
      (domain) => callback.hostname === domain || callback.hostname.endsWith(`.${domain}`),
    )
  );
}

async function readExchangeBody(
  request: Request,
): Promise<{ readonly code: string; readonly codeVerifier: string } | null> {
  try {
    const { code, codeVerifier } = (await request.json()) as {
      readonly code?: unknown;
      readonly codeVerifier?: unknown;
    };
    if (
      typeof code !== "string" ||
      code.length < 32 ||
      typeof codeVerifier !== "string" ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)
    ) {
      return null;
    }
    return { code, codeVerifier };
  } catch {
    return null;
  }
}

async function authorizationIdentifier(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return `first-party:${base64Url(new Uint8Array(digest))}`;
}

async function pkceChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
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

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function includesEmail(emails: ReadonlySet<string>, email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return [...emails].some((candidate) => candidate.trim().toLowerCase() === normalizedEmail);
}
