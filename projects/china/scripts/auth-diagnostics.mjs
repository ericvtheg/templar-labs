import { env } from "node:process";

const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
const emails = (env.CHINA_CREW_EMAILS ?? "").split(/[\s,;]+/).filter(Boolean);
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
const jwks = await fetch("https://auth.breli.app/api/auth/jwks");
const keys = await jwks.json();
console.log(
  JSON.stringify({ jwksStatus: jwks.status, signingAlgorithms: keys.keys?.map((key) => key.alg) }),
);
