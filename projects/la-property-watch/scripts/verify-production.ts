import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

function environment(name: string): string | undefined {
  return process.env[name];
}

function requiredEnvironment(name: string): string {
  const value = environment(name);
  if (value === undefined) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const baseUrl = new URL(
  environment("LA_PROPERTY_WATCH_URL") ?? "https://la-property-watch.breli.app",
);
const secret = requiredEnvironment("TEMPLAR_AUTH_SECRET");

const allowedEmail = "ericventor97@gmail.com";
const userAgent = "TemplarLabs-LAPropertyWatch-ProductionVerification/1.0";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function sessionCookie(input: { email: string; verified: boolean }): Promise<string> {
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
        id: `ci-${randomUUID()}`,
        userId: `ci-${randomUUID()}`,
        name: "Production verification",
        email: input.email,
        emailVerified: input.verified,
        image: null,
        admin: false,
        createdAt: now,
        expiresAt: now + 15 * 60_000,
      }),
    ),
  );
  return `templar.auth.session=${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

async function request(
  path: string,
  options: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("user-agent", userAgent);
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  return fetch(new URL(path, baseUrl), {
    ...options,
    headers,
    redirect: "manual",
  });
}

async function expectStatus(path: string, status: number, cookie?: string) {
  const response = await request(path, cookie === undefined ? {} : { cookie });
  check(response.status === status, `${path} returned ${response.status}; expected ${status}.`);
}

async function verifyGoogleRedirect() {
  let current = new URL("/api/auth/sign-in?returnTo=/", baseUrl);
  const origins = new Set<string>();
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      headers: { "user-agent": userAgent },
      redirect: "manual",
    });
    const location = response.headers.get("location");
    check(response.status >= 300 && response.status < 400 && location, "Sign-in did not redirect.");
    current = new URL(location, current);
    origins.add(current.origin);
    if (current.hostname === "accounts.google.com") {
      break;
    }
  }
  check(origins.has("https://auth.breli.app"), "Sign-in did not use central Templar auth.");
  check(
    [...origins].some((origin) => origin === "https://accounts.google.com"),
    "Central auth did not redirect to Google.",
  );
}

const authorized = await sessionCookie({ email: allowedEmail, verified: true });
const wrongEmail = await sessionCookie({
  email: "not-eric@example.com",
  verified: true,
});
const unverified = await sessionCookie({
  email: allowedEmail,
  verified: false,
});
const [cookieName, cookieValue] = authorized.split("=");
const [iv, ciphertext] = cookieValue?.split(".") ?? [];
check(cookieName && iv && ciphertext, "Could not construct the verification session.");
const forgedCiphertext = `${ciphertext.startsWith("a") ? "b" : "a"}${ciphertext.slice(1)}`;
const forged = `${cookieName}=${iv}.${forgedCiphertext}`;

// New custom domains may take a short time to resolve after deployment.
for (let attempt = 0; ; attempt += 1) {
  try {
    await expectStatus("/api/research/data", 401);
    break;
  } catch (cause) {
    if (attempt >= 11) {
      throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
await expectStatus("/api/research/data", 401, forged);
await expectStatus("/api/research/data", 403, wrongEmail);
await expectStatus("/api/research/data", 403, unverified);
await verifyGoogleRedirect();

const initial = await request("/api/research/data", { cookie: authorized });
check(initial.status === 200, `Authorized data request returned ${initial.status}.`);

const readOnly = process.argv.includes("--read-only");
let jobId: string | undefined;
if (!readOnly) {
  const refresh = await request("/api/research/refresh", {
    method: "POST",
    cookie: authorized,
    headers: { origin: baseUrl.origin },
  });
  check(refresh.status === 200 || refresh.status === 202, `Refresh returned ${refresh.status}.`);
  const refreshBody = (await refresh.json()) as { job?: { id?: string } };
  jobId = refreshBody.job?.id;
  check(jobId, "Refresh did not return a job ID.");

  if (environment("CLOUDFLARE_API_TOKEN")) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--experimental-strip-types",
          fileURLToPath(new URL("./ingest-production.ts", import.meta.url).href),
          "--queued-only",
        ],
        { stdio: "inherit", timeout: 10 * 60_000 },
      );
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Production ingestion runner exited ${code}.`));
        }
      });
    });
  }
}

type DashboardPayload = {
  properties: Array<{
    propertyKey: string;
    jurisdictionId: string;
    signalTypes: string[];
    evidenceCount: number;
    score: number;
  }>;
  page: { total: number };
  refreshJobs: Array<{ id: string; status: string }>;
  sources: Array<{
    sourceId: string;
    status: string;
    recordsUpserted: number;
    snapshotComplete: boolean;
    error: string | null;
  }>;
};

const deadline = Date.now() + 12 * 60_000;
let dashboard: DashboardPayload | undefined = readOnly
  ? ((await initial.json()) as DashboardPayload)
  : undefined;
while (Date.now() < deadline) {
  if (readOnly) {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const response = await request("/api/research/data", { cookie: authorized });
  check(response.status === 200, `Refresh polling returned ${response.status}.`);
  dashboard = (await response.json()) as DashboardPayload;
  const job = dashboard.refreshJobs.find((candidate) => candidate.id === jobId);
  if (job && !["queued", "running"].includes(job.status)) {
    check(["success", "partial"].includes(job.status), `Refresh finished as ${job.status}.`);
    break;
  }
}
check(dashboard, "No dashboard payload was returned while polling.");
check(
  readOnly ||
    dashboard.refreshJobs.some(
      (job) => job.id === jobId && ["success", "partial"].includes(job.status),
    ),
  "Refresh did not finish before the verification deadline.",
);

const requiredSources = [
  "travis-tax-delinquency",
  "norfolk-delinquent-property-tax",
  "norfolk-code-violations",
  "nyc-acris-common-charge-liens",
  "denver-public-trustee-ned",
];
for (const sourceId of requiredSources) {
  const source = dashboard.sources.find((candidate) => candidate.sourceId === sourceId);
  check(source, `${sourceId} had no persisted source run.`);
  check(source.status === "success", `${sourceId} finished as ${source.status}.`);
  check(source.recordsUpserted > 0, `${sourceId} persisted no evidence.`);
}
const acris = dashboard.sources.find(
  (source) => source.sourceId === "nyc-acris-common-charge-liens",
);
check(acris?.snapshotComplete === false, "ACRIS must remain append/update event evidence.");
const denver = dashboard.sources.find((source) => source.sourceId === "denver-public-trustee-ned");
check(
  /Terms of Use|permission/i.test(denver?.error ?? ""),
  "Denver authorization warning was not persisted.",
);

async function currentMarket(jurisdiction: string): Promise<DashboardPayload> {
  const response = await request(`/api/research/data?jurisdiction=${jurisdiction}`, {
    cookie: authorized,
  });
  check(response.status === 200, `${jurisdiction} dashboard returned ${response.status}.`);
  const payload = (await response.json()) as DashboardPayload;
  check(payload.page.total > 0, `${jurisdiction} had no ranked current properties.`);
  check(
    payload.properties.every((property) => property.jurisdictionId === jurisdiction),
    `${jurisdiction} filter returned a different jurisdiction.`,
  );
  check(
    payload.properties.every(
      (property, index) => index === 0 || property.score <= payload.properties[index - 1]!.score,
    ),
    `${jurisdiction} ranking was not descending.`,
  );
  return payload;
}
const markets = Object.fromEntries(
  await Promise.all(
    ["travis-county-tx", "norfolk-va", "nyc-ny", "denver-co"].map(async (jurisdiction) => [
      jurisdiction,
      await currentMarket(jurisdiction),
    ]),
  ),
) as Record<string, DashboardPayload>;

const representativeEvidence = [];
for (const [jurisdiction, market] of Object.entries(markets)) {
  const candidate = market.properties[0];
  check(candidate, `${jurisdiction} missing representative property`);
  const response = await request(
    `/api/research/properties/${encodeURIComponent(candidate.propertyKey)}?evidencePageSize=50`,
    { cookie: authorized },
  );
  check(response.status === 200, `${jurisdiction} detail failed`);
  const detail = (await response.json()) as {
    evidence: Array<{
      sourceRecordId: string;
      sourceUrl: string;
      observedAt: string;
      sourceUpdatedAt: string | null;
      sourceGoodThrough: string | null;
      eventDate: string | null;
      delinquentAmountCents: number | null;
      taxDueCents: number | null;
      penaltyDueCents: number | null;
      interestDueCents: number | null;
      signalType: string;
    }>;
  };
  check(detail.evidence.length > 0, `${jurisdiction} missing evidence`);
  check(
    detail.evidence.every((row) => row.sourceRecordId && row.sourceUrl && row.observedAt),
    `${jurisdiction} incomplete provenance`,
  );
  if (jurisdiction === "norfolk-va" || jurisdiction === "travis-county-tx") {
    const tax = detail.evidence.find((row) => row.signalType === "tax_delinquency");
    check(
      tax && Number.isSafeInteger(tax.delinquentAmountCents) && tax.delinquentAmountCents! > 0,
      `${jurisdiction} missing exact tax amount`,
    );
    check(tax.sourceUpdatedAt, `${jurisdiction} missing source date`);
    if (jurisdiction === "norfolk-va") {
      check(
        tax.delinquentAmountCents ===
          (tax.taxDueCents ?? 0) + (tax.penaltyDueCents ?? 0) + (tax.interestDueCents ?? 0),
        "Norfolk amount components do not reconcile",
      );
    }
  }
  if (jurisdiction === "nyc-ny") {
    check(
      detail.evidence.every((row) => row.sourceGoodThrough && row.eventDate),
      "ACRIS lost row coverage or recording date",
    );
  }
  representativeEvidence.push({
    jurisdiction,
    propertyKey: candidate.propertyKey,
    evidence: detail.evidence.slice(0, 3),
  });
}

const codeResponse = await request(
  "/api/research/data?jurisdiction=norfolk-va&signal=code_violation",
  { cookie: authorized },
);
check(codeResponse.status === 200, `Norfolk code filter returned ${codeResponse.status}.`);
const codeDashboard = (await codeResponse.json()) as DashboardPayload;
check(codeDashboard.page.total > 0, "No ranked Norfolk code-violation properties were returned.");
const property = codeDashboard.properties[0];
check(property?.propertyKey, "No ranked property was available for evidence verification.");
const detailResponse = await request(
  `/api/research/properties/${encodeURIComponent(property.propertyKey)}?evidencePage=1&evidencePageSize=10`,
  { cookie: authorized },
);
check(detailResponse.status === 200, `Property detail returned ${detailResponse.status}.`);
const detail = (await detailResponse.json()) as {
  property: { propertyKey: string; score: number; scoreReasons: string[] };
  evidence: Array<{
    id: string;
    sourceUrl: string;
    sourceRecordId: string;
    snapshotPresence: string;
  }>;
  evidenceTotal: number;
  evidencePage: { page: number; pageSize: number; total: number; totalPages: number };
};
check(detail.property.propertyKey === property.propertyKey, "Property detail identity changed.");
check(
  detail.property.score > 0 && detail.property.scoreReasons.length > 0,
  "Rank explanation was missing.",
);
check(
  detail.evidenceTotal >= detail.evidence.length && detail.evidence.length > 0,
  "Property evidence was empty.",
);
check(
  detail.evidence[0]?.snapshotPresence === "present",
  "Current evidence was not returned first.",
);
check(
  detail.evidence.every((record) => record.sourceRecordId && record.sourceUrl),
  "Evidence provenance was incomplete.",
);
check(
  detail.evidencePage.page === 1 && detail.evidencePage.pageSize === 10,
  "Evidence pagination metadata was incorrect.",
);

const workspaceResponse = await request(
  "/api/research/workspace?activityPageSize=10&alertPageSize=10",
  { cookie: authorized },
);
check(workspaceResponse.status === 200, `Partner workspace returned ${workspaceResponse.status}.`);
const workspace = (await workspaceResponse.json()) as {
  activity: unknown[];
  alerts: unknown[];
  activityPage: { page: number; pageSize: number; total: number };
  alertPage: { page: number; pageSize: number; total: number };
  alertPreferences: { externalDelivery: string };
};
check(
  workspace.activityPage.pageSize === 10 &&
    workspace.activityPage.total >= workspace.activity.length,
  "Activity pagination boundary was missing.",
);
check(
  workspace.alertPage.pageSize === 10 && workspace.alertPage.total >= workspace.alerts.length,
  "Alert pagination boundary was missing.",
);
check(
  workspace.alertPreferences.externalDelivery === "not_configured",
  "Workspace claimed unsupported external delivery.",
);
const briefResponse = await request(
  `/api/research/deal-briefs/${encodeURIComponent(property.propertyKey)}?evidencePage=1&evidencePageSize=10`,
  { cookie: authorized },
);
check(briefResponse.status === 200, `Deal brief returned ${briefResponse.status}.`);
const brief = (await briefResponse.json()) as {
  property: { propertyKey: string };
  distressStrength: { limitations: string[] };
  evidenceConfidence: { level: string };
  buyingFit: { status: string };
  evidenceTotal: number;
  evidencePage: { pageSize: number };
  limitations: string[];
};
check(brief.property.propertyKey === property.propertyKey, "Deal brief identity changed.");
check(
  brief.distressStrength.limitations.some((entry) =>
    /never a foreclosure probability/i.test(entry),
  ),
  "Deal brief lost distress limitation.",
);
check(
  ["match", "no_match", "unknown"].includes(brief.buyingFit.status),
  "Deal brief fit status was invalid.",
);
check(
  brief.evidenceTotal >= 1 && brief.evidencePage.pageSize === 10,
  "Deal brief evidence boundary was missing.",
);

const selectedCsv = await request("/api/research/export-selected.csv", {
  method: "POST",
  cookie: authorized,
  headers: { origin: baseUrl.origin, "content-type": "application/json" },
  body: JSON.stringify({ propertyKeys: [property.propertyKey] }),
});
check(selectedCsv.status === 200, `Selected evidence export returned ${selectedCsv.status}.`);
const selectedCsvText = await selectedCsv.text();
check(
  selectedCsvText.includes(property.propertyKey),
  "Selected export omitted the requested property.",
);
check(
  /principal_balance_cents/.test(selectedCsvText.split("\n")[0] ?? ""),
  "Selected export lost amount typing.",
);

const invalid = await request("/api/research/data?page=abc", { cookie: authorized });
check(invalid.status === 400, `Invalid pagination returned ${invalid.status}.`);
check(
  /private, no-store/.test(invalid.headers.get("cache-control") ?? ""),
  "Validation response was cacheable.",
);

const csv = await request("/api/research/export.csv", { cookie: authorized });
check(csv.status === 200, `Protected CSV returned ${csv.status}.`);
check(
  csv.headers.get("content-type")?.startsWith("text/csv"),
  "Protected export did not return CSV.",
);
const csvText = await csv.text();
check(csvText.startsWith('"rank_score","rank_reasons","property_key"'), "CSV header was stale.");
check(csvText.includes(property.propertyKey), "CSV did not include the verified ranked property.");

console.log(
  JSON.stringify(
    {
      origin: baseUrl.origin,
      authorizationChecks: "passed",
      representativeEvidence,
      interactiveAuthRedirect: "central Templar auth -> Google",
      refreshJobId: jobId,
      rankedPropertiesOnFirstPage: dashboard.properties.length,
      currentMarketTotals: Object.fromEntries(
        Object.entries(markets).map(([jurisdiction, payload]) => [
          jurisdiction,
          payload.page.total,
        ]),
      ),
      verifiedPropertyKey: property.propertyKey,
      verifiedEvidenceRows: detail.evidenceTotal,
      exportBytes: new TextEncoder().encode(csvText).byteLength,
      sources: dashboard.sources.map((source) => ({
        sourceId: source.sourceId,
        status: source.status,
        recordsUpserted: source.recordsUpserted,
        snapshotComplete: source.snapshotComplete,
      })),
    },
    null,
    2,
  ),
);
