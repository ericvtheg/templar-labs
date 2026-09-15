import { env } from "node:process";

const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
const emails = (env.CHINA_CREW_EMAILS ?? "").split(/[\s,;]+/).filter(Boolean);
if (
  (env.RUN_LEARNING_PROBE === "true" || env.RUN_SPEECH_WARMUP === "true") &&
  env.RUN_OWNER_HANDOFF_PROBE !== "true"
) {
  throw new Error("Learning checks and speech pre-generation require the owner handoff.");
}
if (!account || !token) {
  throw new Error("Cloudflare diagnostic credentials missing.");
}
async function cf(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(
      `Cloudflare diagnostic request failed: HTTP ${response.status}, codes ${data.errors?.map((item) => item.code).join(",")}`,
    );
  }
  return data.result;
}
const [china, auth] = await Promise.all([
  cf("workers/scripts/china-website/settings"),
  cf("workers/scripts/templar-auth-website/settings"),
]);
const chinaIssuer = china.bindings.find((binding) => binding.name === "TEMPLAR_AUTH_ISSUER")?.text;
const centralIssuer = auth.bindings.find((binding) => binding.name === "AUTH_BASE_URL")?.text;
console.log(
  JSON.stringify(
    {
      inviteCount: emails.length,
      chinaIssuer,
      centralIssuer,
      issuerMatches: chinaIssuer === centralIssuer,
      chinaAuthSecretPresent: china.bindings.some((binding) => binding.name === "AUTH_SECRET"),
      chinaInviteSecretPresent: china.bindings.some((binding) => binding.name === "CREW_EMAILS"),
      speechSecretPresent: china.bindings.some((binding) => binding.name === "ELEVENLABS_API_KEY"),
      aiSecretPresent: china.bindings.some((binding) => binding.name === "OPENROUTER_API_TOKEN"),
      speechStoragePresent: china.bindings.some((binding) => binding.name === "R2"),
    },
    null,
    2,
  ),
);
const db = auth.bindings.find((binding) => binding.name === "DB")?.id;
if (!db) {
  throw new Error("Central auth database binding missing.");
}
// Read-only account diagnostics; never emit names, emails, IDs, session tokens, or signing keys.
const accounts = await Promise.all(
  emails.map(async (email, index) => {
    const result = await cf(`d1/database/${db}/query`, {
      sql: "SELECT email_verified AS verified, (SELECT COUNT(*) FROM session s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions FROM user u WHERE lower(email) = lower(?)",
      params: [Date.now(), email],
    });
    const user = result[0]?.results[0];
    return {
      invitePosition: index + 1,
      userExists: Boolean(user),
      emailVerifiedValue: user?.verified,
      emailVerifiedType: typeof user?.verified,
      activeSessions: user?.active_sessions,
    };
  }),
);
console.log(JSON.stringify({ accounts }, null, 2));
const { platformAdminEmails } = await import("../../templar-auth/apps/web/src/lib/access.ts");
const owners = await Promise.all(
  [...platformAdminEmails].map(async (email) => {
    const result = await cf(`d1/database/${db}/query`, {
      sql: "SELECT email_verified AS verified, (SELECT COUNT(*) FROM session s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions FROM user u WHERE lower(email) = lower(?)",
      params: [Date.now(), email],
    });
    const user = result[0]?.results[0];
    return {
      platformAdminExists: Boolean(user),
      emailVerified: user?.verified,
      activeSessions: user?.active_sessions,
      includedInChinaInvites: emails.some((invite) => invite.toLowerCase() === email.toLowerCase()),
    };
  }),
);
console.log(JSON.stringify({ owners }, null, 2));
if (env.RUN_OWNER_HANDOFF_PROBE === "true") {
  // Restricted to an existing, verified platform owner configured in central SSO source.
  // This exercises the same code exchange as an existing central session, without touching
  // the owner's browser/Google session or exposing the resulting app cookie to logs.
  const ownerEmail = [...platformAdminEmails][0];
  if (!ownerEmail) {
    throw new Error("No configured platform owner to probe.");
  }
  const selected = await cf(`d1/database/${db}/query`, {
    sql: "SELECT id FROM user WHERE lower(email) = lower(?) AND email_verified = 1",
    params: [ownerEmail],
  });
  const ownerId = selected[0]?.results[0]?.id;
  if (!ownerId) {
    throw new Error("A verified platform owner must already exist; no account will be created.");
  }
  const origin = "https://china.ericventor.com";
  const start = await fetch(`${origin}/api/auth/sign-in?returnTo=/`, { redirect: "manual" });
  const authorization = new URL(start.headers.get("location"));
  if (authorization.origin !== "https://auth.breli.app") {
    throw new Error("Unexpected auth issuer.");
  }
  const callback = new URL(authorization.searchParams.get("callback"));
  if (callback.href !== `${origin}/api/auth/callback`) {
    throw new Error("Unexpected callback.");
  }
  const transaction = start.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("templar.auth.transaction="))
    ?.split(";")[0];
  const state = authorization.searchParams.get("state");
  const codeChallenge = authorization.searchParams.get("code_challenge");
  if (!transaction || !state || !codeChallenge) {
    throw new Error("App did not create a complete sign-in transaction.");
  }
  const code = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const identifier = `first-party:${Buffer.from(digest).toString("base64url")}`;
  const now = Date.now();
  try {
    await cf(`d1/database/${db}/query`, {
      sql: "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [
        crypto.randomUUID(),
        identifier,
        JSON.stringify({ userId: ownerId, codeChallenge }),
        now + 60_000,
        now,
        now,
      ],
    });
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    const returned = await fetch(callback, {
      redirect: "manual",
      headers: { cookie: transaction },
    });
    const destination = new URL(returned.headers.get("location") ?? "/", origin);
    const session = returned.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("templar.auth.session="))
      ?.split(";")[0];
    console.log(
      JSON.stringify({
        ownerHandoff: {
          status: returned.status,
          returnedPath: destination.pathname,
          failureStage:
            destination.searchParams.get("reason") ?? destination.searchParams.get("auth_reason"),
          sessionIssued: Boolean(session),
        },
      }),
    );
    if (
      !session ||
      destination.searchParams.has("error") ||
      destination.pathname === "/auth-error"
    ) {
      throw new Error("Live owner handoff did not issue a session.");
    }
    const stateResponse = await fetch(`${origin}/api/trip/state`, {
      headers: { cookie: session },
      redirect: "manual",
    });
    console.log(JSON.stringify({ ownerSessionStateStatus: stateResponse.status }));
    const tripState = await stateResponse.json();
    if (stateResponse.status !== 200) {
      throw new Error("Live owner session cannot access the app.");
    }
    if (env.RUN_SPEECH_WARMUP === "true") {
      const { warmSpeech } = await import("../apps/web/src/lib/speech-warmup.ts");
      const result = await warmSpeech({
        origin,
        session,
        onProgress: (stats) => console.log(JSON.stringify({ speechWarmupProgress: stats })),
      });
      console.log(JSON.stringify({ speechWarmup: result }));
    }
    if (env.RUN_LEARNING_PROBE === "true") {
      const { probeLearning } = await import("./learning-probe.mjs");
      const chinaDb = china.bindings.find((binding) => binding.name === "DB")?.id;
      if (!chinaDb) {
        throw new Error("China database binding missing.");
      }
      await probeLearning({
        origin,
        session,
        profileReady: Boolean(tripState.user?.name),
        deleteScene: (id) =>
          cf(`d1/database/${chinaDb}/query`, {
            sql: "DELETE FROM coach_scenes WHERE id = ? AND user_id = ?",
            params: [id, ownerId],
          }),
      });
    }
    const guestResponse = await fetch(`${origin}/api/trip/state`, { redirect: "manual" });
    console.log(JSON.stringify({ signedOutStateStatus: guestResponse.status }));
    await guestResponse.body?.cancel();
    if (guestResponse.status !== 401) {
      throw new Error("Signed-out access was not blocked.");
    }
  } finally {
    // The central exchange normally consumes the code; cleanup also handles failures/timeouts.
    await cf(`d1/database/${db}/query`, {
      sql: "DELETE FROM verification WHERE identifier = ?",
      params: [identifier],
    });
  }
}
const jwks = await fetch("https://auth.breli.app/api/auth/jwks");
const keys = await jwks.json();
console.log(
  JSON.stringify({ jwksStatus: jwks.status, signingAlgorithms: keys.keys?.map((key) => key.alg) }),
);
