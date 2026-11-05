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

const refresh = await request("/api/research/refresh", {
  method: "POST",
  cookie: authorized,
  headers: { origin: baseUrl.origin },
});
check(refresh.status === 200 || refresh.status === 202, `Refresh returned ${refresh.status}.`);
const refreshBody = (await refresh.json()) as { job?: { id?: string } };
const jobId = refreshBody.job?.id;
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

const deadline = Date.now() + 12 * 60_000;
let dashboard:
  | {
      records: Array<{ saleType: string }>;
      refreshJobs: Array<{ id: string; status: string }>;
      sources: Array<{
        sourceId: string;
        status: string;
        recordsUpserted: number;
      }>;
    }
  | undefined;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const response = await request("/api/research/data", { cookie: authorized });
  check(response.status === 200, `Refresh polling returned ${response.status}.`);
  dashboard = (await response.json()) as typeof dashboard;
  const job = dashboard?.refreshJobs.find((candidate) => candidate.id === jobId);
  if (job && !["queued", "running"].includes(job.status)) {
    check(["success", "partial"].includes(job.status), `Refresh finished as ${job.status}.`);
    break;
  }
}
check(dashboard, "No dashboard payload was returned while polling.");
check(
  dashboard.refreshJobs.some(
    (job) => job.id === jobId && ["success", "partial"].includes(job.status),
  ),
  "Refresh did not finish before the verification deadline.",
);
check(
  dashboard.records.some((record) => record.saleType === "tax_default"),
  "No official tax-auction records were persisted.",
);
check(
  dashboard.records.some((record) => record.saleType === "trustee"),
  "No trustee-notice records were persisted.",
);
check(
  dashboard.sources.some(
    (source) => source.sourceId === "la-ttc-tax-auction" && source.recordsUpserted > 0,
  ),
  "TTC source status did not report persisted records.",
);
check(
  dashboard.sources.some(
    (source) => source.sourceId === "cnpa-trustee-notices" && source.recordsUpserted > 0,
  ),
  "CNPA source status did not report persisted records.",
);

const csv = await request("/api/research/export.csv", { cookie: authorized });
check(csv.status === 200, `Protected CSV returned ${csv.status}.`);
check(
  csv.headers.get("content-type")?.startsWith("text/csv"),
  "Protected export did not return CSV.",
);

console.log(
  JSON.stringify(
    {
      origin: baseUrl.origin,
      authorizationChecks: "passed",
      interactiveAuthRedirect: "central Templar auth -> Google",
      refreshJobId: jobId,
      records: dashboard.records.length,
      taxRecords: dashboard.records.filter((record) => record.saleType === "tax_default").length,
      trusteeRecords: dashboard.records.filter((record) => record.saleType === "trustee").length,
      sources: dashboard.sources.map((source) => ({
        sourceId: source.sourceId,
        status: source.status,
        recordsUpserted: source.recordsUpserted,
      })),
    },
    null,
    2,
  ),
);
