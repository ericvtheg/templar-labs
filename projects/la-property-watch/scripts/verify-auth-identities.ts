import assert from "node:assert/strict";
import { allowedEmails } from "../apps/web/src/lib/model.ts";

// Read-only, scoped identity diagnostics. Never select tokens, user IDs, or sessions.
const account = process.env["CLOUDFLARE_ACCOUNT_ID"];
const token = process.env["CLOUDFLARE_API_TOKEN"];
assert(account && token, "Cloudflare credentials are required");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, `Cloudflare HTTP ${response.status}`);
  const payload = (await response.json()) as { success: boolean; result: unknown };
  assert(payload.success, "Cloudflare request failed");
  return payload.result;
}
const settings = (await api("/workers/scripts/templar-auth-website/settings")) as {
  bindings: Array<{ name: string; id?: string }>;
};
const db = settings.bindings.find((binding) => binding.name === "DB")?.id;
assert(db, "Shared auth DB binding missing");
for (const [index, email] of allowedEmails.entries()) {
  const result = (await api(`/d1/database/${db}/query`, {
    sql: `SELECT u.email_verified AS verified,
      (SELECT COUNT(*) FROM account a WHERE a.user_id = u.id AND a.provider_id = 'google') AS google_accounts
      FROM user u WHERE lower(trim(u.email)) = ?`,
    params: [email.toLowerCase()],
  })) as Array<{ success: boolean; results: Array<{ verified: number; google_accounts: number }> }>;
  assert(result[0]?.success, "Identity query failed");
  const rows = result[0].results;
  console.log(
    JSON.stringify({
      approvedAccount: index + 1,
      canonicalMatches: rows.length,
      verified: rows.map((row) => row.verified === 1),
      googleAccounts: rows.map((row) => row.google_accounts),
    }),
  );
}
