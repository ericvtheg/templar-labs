import { createHash, randomBytes, webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadDashboard } from "../apps/web/src/lib/repository.ts";
import { CloudflareD1 } from "./ingest-production.ts";

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function check(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

async function sessionCookie(secret: string) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    createHash("sha256").update(secret).digest(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const now = Date.now();
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        id: `query-diagnostic-${crypto.randomUUID()}`,
        userId: `query-diagnostic-${crypto.randomUUID()}`,
        name: "Property Watch query diagnostic",
        email: "ericventor97@gmail.com",
        emailVerified: true,
        image: null,
        admin: false,
        createdAt: now,
        expiresAt: now + 10 * 60_000,
      }),
    ),
  );
  return `templar.auth.session=${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

export async function verifyProductionQueries(options: {
  db: CloudflareD1;
  buyBoxId?: string;
  baseUrl: URL;
  authSecret: string;
}) {
  const selectedBuyBox = options.buyBoxId
    ? await options.db
        .prepare("SELECT id FROM buy_boxes WHERE id=?")
        .bind(options.buyBoxId)
        .first<{ id: string }>()
    : await options.db
        .prepare("SELECT id FROM buy_boxes ORDER BY updated_at DESC,id ASC LIMIT 1")
        .first<{ id: string }>();
  check(
    selectedBuyBox,
    "No persisted buy box is available for the required qualification-plus-buy-box provider gate.",
  );

  const query = {
    page: 1,
    pageSize: 10,
    jurisdiction: "norfolk-va",
    buyBoxId: selectedBuyBox.id,
    fit: "all" as const,
    qualification: "needs_research" as const,
    sort: "fit" as const,
  };
  const direct = await loadDashboard(options.db as unknown as D1Database, query);
  check(Array.isArray(direct.properties), "Direct D1 dashboard query returned no property array.");

  const url = new URL("/api/research/data", options.baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      cookie: await sessionCookie(options.authSecret),
      "user-agent": "PropertyWatch-ReadOnly-D1-Diagnostic/1.0",
    },
    redirect: "manual",
  });
  check(response.status === 200, `Qualification-plus-buy-box API returned ${response.status}.`);
  const payload = (await response.json()) as {
    properties?: unknown[];
    page?: { total?: number };
  };
  check(Array.isArray(payload.properties), "Production API dashboard payload was malformed.");
  return {
    buyBoxId: selectedBuyBox.id,
    qualification: query.qualification,
    directRows: direct.properties.length,
    directTotal: direct.page.total,
    apiRows: payload.properties.length,
    apiTotal: payload.page?.total ?? null,
    apiStatus: response.status,
    actualD1Usage: options.db.usageSummary(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new CloudflareD1({
    accountId: required("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required("CLOUDFLARE_API_TOKEN"),
  });
  await db.discover();
  const requestedBuyBoxId = process.env["BUY_BOX_ID"];
  const result = await verifyProductionQueries({
    db,
    ...(requestedBuyBoxId ? { buyBoxId: requestedBuyBoxId } : {}),
    baseUrl: new URL(process.env["LA_PROPERTY_WATCH_URL"] ?? "https://la-property-watch.breli.app"),
    authSecret: required("TEMPLAR_AUTH_SECRET"),
  });
  console.log(JSON.stringify({ verified: true, mode: "read_only", ...result }, null, 2));
}
