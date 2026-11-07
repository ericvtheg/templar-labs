import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { CloudflareD1 } from "./ingest-production.ts";
import { acceptanceCleanupGuard } from "./mutation-acceptance-cleanup.ts";
import { isClassifiedTestOnlyBenchmarkExport } from "./mutation-acceptance-validation.ts";
import { verifyProductionQueries } from "./verify-production-queries.ts";

const baseUrl = new URL(
  process.env["LA_PROPERTY_WATCH_URL"] ?? "https://la-property-watch.breli.app",
);
const secret = required("TEMPLAR_AUTH_SECRET");
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const apiToken = required("CLOUDFLARE_API_TOKEN");
const actor = "ericventor97@gmail.com";
const partner = "Rhwcreative@gmail.com";
const runId = randomUUID();
const label = `Production acceptance ${runId}`;
const noteBody = `${label}: temporary source-verification workflow note; remove after acceptance.`;
const dated = (value: number | null) => ({
  value,
  asOf: value === null ? null : new Date().toISOString().slice(0, 10),
});

type PipelineRow = {
  property_key: string;
  saved: number;
  dismissed: number;
  stage: string;
  assigned_to: string | null;
  follow_up_at: string | null;
  pass_reason: string | null;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};
type PreferenceRow = {
  user_email: string;
  new_activity: number;
  worsening_activity: number;
  due_follow_ups: number;
  updated_at: string;
  version: number;
};
type RankingRow = {
  enabled: number;
  minimum_samples: number;
  maximum_adjustment: number;
  reason: string;
  version: number;
  updated_at: string;
  updated_by: string;
  operation_token: string;
};
type OfficialDataCounts = {
  enrichmentRows: number;
  extensionRows: number;
  saleCandidateRows: number;
  enrichmentRuns: number;
  officialRecheckRows: number;
};
async function readOfficialData(db: CloudflareD1, propertyKey: string, recheckId: string | null) {
  const result = await db
    .prepare(`SELECT
    (SELECT COUNT(*) FROM property_enrichment WHERE property_key=?) enrichmentRows,
    (SELECT COUNT(*) FROM property_enrichment_extensions WHERE property_key=?) extensionRows,
    (SELECT COUNT(*) FROM property_sales WHERE subject_property_key=?) saleCandidateRows,
    (SELECT COUNT(*) FROM enrichment_runs WHERE property_key=? AND status='success') enrichmentRuns,
    (SELECT COUNT(*) FROM property_rechecks WHERE property_key=? AND id=?) officialRecheckRows`)
    .bind(propertyKey, propertyKey, propertyKey, propertyKey, propertyKey, recheckId)
    .first<OfficialDataCounts>();
  check(result, "Could not read official-data retention counts.");
  return result;
}
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
async function sessionCookie(email: string) {
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
        id: `partner-acceptance-${runId}-${email}`,
        userId: `partner-acceptance-${runId}-${email}`,
        name: "Property Watch acceptance",
        email,
        emailVerified: true,
        image: null,
        admin: false,
        createdAt: now,
        expiresAt: now + 15 * 60_000,
      }),
    ),
  );
  return `templar.auth.session=${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

const [cookie, partnerCookie] = await Promise.all([sessionCookie(actor), sessionCookie(partner)]);
function requestWithCookie(session: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", session);
  headers.set("user-agent", "PropertyWatch-Partner-Mutation-Acceptance/2.0");
  if (init.method && init.method !== "GET") {
    headers.set("origin", baseUrl.origin);
  }
  return fetch(new URL(path, baseUrl), { ...init, headers, redirect: "manual" });
}
function request(path: string, init: RequestInit = {}) {
  return requestWithCookie(cookie, path, init);
}
async function jsonRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await request(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const payload = (await response.json()) as T & { error?: string };
  check(response.ok, `${path} returned ${response.status}: ${payload.error ?? "private error"}`);
  return payload;
}
async function partnerJsonRequest<T>(path: string): Promise<T> {
  const response = await requestWithCookie(partnerCookie, path);
  const payload = (await response.json()) as T & { error?: string };
  check(response.ok, `${path} returned ${response.status}: ${payload.error ?? "private error"}`);
  return payload;
}
async function partnerPostJsonRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await requestWithCookie(partnerCookie, path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl.origin },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  check(response.ok, `${path} returned ${response.status}: ${payload.error ?? "private error"}`);
  return payload;
}

const db = new CloudflareD1({ accountId, apiToken });
await db.discover();
const rollbackSentinelId = `acceptance-rollback-${runId}`;
let rollbackFailedAsIntended = false;
try {
  await db.batch([
    db
      .prepare(
        "INSERT INTO property_notes (id,property_key,body,author_email,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        rollbackSentinelId,
        `__acceptance_rollback__:${runId}`,
        `${label}: disposable rollback sentinel`,
        actor,
        new Date().toISOString(),
      ),
    db.prepare(
      "INSERT INTO partner_properties (property_key,saved,dismissed,stage,version,created_at,created_by,updated_at,updated_by) VALUES ('__acceptance_intentional_failure__',NULL,0,'New',1,'guard','guard','guard','guard')",
    ),
  ]);
} catch {
  rollbackFailedAsIntended = true;
}
const leakedSentinel = await db
  .prepare("SELECT id FROM property_notes WHERE id=? AND author_email=?")
  .bind(rollbackSentinelId, actor)
  .first<{ id: string }>();
if (leakedSentinel) {
  await db
    .prepare("DELETE FROM property_notes WHERE id=? AND author_email=?")
    .bind(rollbackSentinelId, actor)
    .run();
  throw new Error(
    "Actual D1 batch rollback leaked the exact acceptance sentinel; it was removed and meaningful mutations were stopped.",
  );
}
check(
  rollbackFailedAsIntended,
  "Actual D1 rollback guard did not fail as intended; meaningful mutations were stopped.",
);
const requestedKey = process.env["PROPERTY_KEY"];
const targetSql = `SELECT r.property_key propertyKey,MAX(r.jurisdiction_id) jurisdictionId,MAX(r.apn) apn
  FROM foreclosure_records r
  WHERE r.jurisdiction_id='norfolk-va' AND LENGTH(r.apn)=8 AND r.apn NOT GLOB '*[^0-9]*'
    ${requestedKey ? "AND r.property_key=?" : ""}
    AND NOT EXISTS (SELECT 1 FROM partner_properties p WHERE p.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_alerts a WHERE a.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_notes n WHERE n.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_value_assumptions v WHERE v.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_deal_scenarios s WHERE s.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_enrichment e WHERE e.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_sales s WHERE s.subject_property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_assessments a WHERE a.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_rechecks c WHERE c.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_qualification_overrides q WHERE q.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_feedback f WHERE f.property_key=r.property_key)
  GROUP BY r.property_key ORDER BY r.property_key LIMIT 1`;
const targetStatement = db.prepare(targetSql);
const target = requestedKey
  ? await targetStatement.bind(requestedKey).first<{
      propertyKey: string;
      jurisdictionId: string;
      apn: string;
    }>()
  : await targetStatement.first<{ propertyKey: string; jurisdictionId: string; apn: string }>();
if (!target && requestedKey) {
  const retained = await db
    .prepare(`SELECT
    (SELECT COUNT(*) FROM foreclosure_records WHERE property_key=?) evidence,
    (SELECT COUNT(*) FROM partner_properties WHERE property_key=?) pipeline,
    (SELECT COUNT(*) FROM property_notes WHERE property_key=?) notes,
    (SELECT COUNT(*) FROM property_deal_scenarios WHERE property_key=?) scenarios,
    (SELECT COUNT(*) FROM property_enrichment WHERE property_key=?) enrichment,
    (SELECT COUNT(*) FROM property_rechecks WHERE property_key=?) rechecks`)
    .bind(requestedKey, requestedKey, requestedKey, requestedKey, requestedKey, requestedKey)
    .first();
  const alerts = await db
    .prepare(
      "SELECT id,kind,created_at,available_at,read_at FROM property_alerts WHERE property_key=? ORDER BY id LIMIT 20",
    )
    .bind(requestedKey)
    .all();
  console.log(
    JSON.stringify({
      mode: "blocked_target_read_only",
      propertyKey: requestedKey,
      retained,
      alerts: alerts.results,
    }),
  );
}
check(
  target,
  requestedKey
    ? "Requested property is not a disposable exact Norfolk property with zero partner/research state."
    : "No disposable real retained Norfolk property is available for mutation acceptance.",
);
const propertyKey = target.propertyKey;
const exactDetail = await jsonRequest<{ property: { propertyKey: string } }>(
  `/api/research/properties/${encodeURIComponent(propertyKey)}?evidencePage=1&evidencePageSize=10`,
);
check(
  exactDetail.property.propertyKey === propertyKey,
  "Exact selected property detail did not match.",
);

const originalPipeline = await db
  .prepare("SELECT * FROM partner_properties WHERE property_key=?")
  .bind(propertyKey)
  .first<PipelineRow>();
const originalPreference = await db
  .prepare("SELECT * FROM user_alert_preferences WHERE user_email=? COLLATE NOCASE")
  .bind(actor)
  .first<PreferenceRow>();
const originalRanking = await db
  .prepare("SELECT * FROM ranking_adjustment_profile WHERE id='shared'")
  .first<RankingRow>();
check(
  !originalPipeline,
  "Disposable property unexpectedly acquired pipeline state before mutation.",
);
let latestPipelineVersion: number | null = null;
let latestPipelineUpdatedAt: string | null = null;
let preferenceUpdatedAt: string | null = null;
let preferenceVersion: number | null = null;
let noteId: string | null = null;
let buyBoxId: string | null = null;
let buyBoxVersion: number | null = null;
let assessmentId: string | null = null;
let recheckId: string | null = null;
let overrideVersion: number | null = null;
let feedbackVersion: number | null = null;
let overrideAuditId: string | null = null;
let feedbackAuditId: string | null = null;
let rankingAuditId: string | null = null;
let rankingToken: { version: number; updatedAt: string } | null = null;
let scenarioToken: { id: string; version: number; operationToken: string } | null = null;
let benchmarkToken: { id: string; version: number } | null = null;
let benchmarkReviewVersion: number | null = null;
let scenarioCandidateAcceptance = "not_checked";
let providerQueryDiagnostics: Awaited<ReturnType<typeof verifyProductionQueries>> | null = null;
let dueAlertIds: string[] = [];
let retainedOfficialData: OfficialDataCounts | null = null;
const workflowFollowUpAt = new Date(Date.now() - 60_000).toISOString();
let workflowFailure: unknown = null;

try {
  const researchState = await jsonRequest<{ version: number; updatedAt: string }>(
    `/api/research/pipeline/${encodeURIComponent(propertyKey)}`,
    {
      expectedVersion: 0,
      patch: {
        saved: true,
        dismissed: false,
        stage: "Researching",
        assignedTo: partner,
        followUpAt: workflowFollowUpAt,
        passReason: null,
      },
    },
  );
  latestPipelineVersion = researchState.version;
  latestPipelineUpdatedAt = researchState.updatedAt;
  const initialAlerts = await db
    .prepare(
      "SELECT id FROM property_alerts WHERE property_key=? AND kind='due_follow_up' AND created_at=? AND available_at=?",
    )
    .bind(propertyKey, researchState.updatedAt, workflowFollowUpAt)
    .all<{ id: string }>();
  dueAlertIds = initialAlerts.results.map((alert) => alert.id);
  const note = await jsonRequest<{ id: string }>(
    `/api/research/notes/${encodeURIComponent(propertyKey)}`,
    {
      body: noteBody,
    },
  );
  noteId = note.id;
  const buyBox = await jsonRequest<{ id: string; version: number }>("/api/research/buy-boxes", {
    id: null,
    expectedVersion: 0,
    name: label,
    propertyTypes: [],
    jurisdictions: [target.jurisdictionId],
    neighborhoods: [],
    zips: [],
    sizeBasis: "none",
    minSizeValue: null,
    maxSizeValue: null,
    minValueCents: null,
    maxValueCents: null,
    valueBasis: "assessed_value",
    valueAssumptionLabel: null,
    distressPhases: [],
  });
  buyBoxId = buyBox.id;
  buyBoxVersion = buyBox.version;
  providerQueryDiagnostics = await verifyProductionQueries({
    db,
    buyBoxId,
    baseUrl,
    authSecret: secret,
  });

  const scenarioPath = `/api/research/scenarios/${encodeURIComponent(propertyKey)}`;
  const scenario = await jsonRequest<{
    id: string;
    version: number;
    result: { evaluation: { status: string; value?: { profit?: number } } };
  }>(scenarioPath, {
    id: null,
    expectedVersion: 0,
    name: `${label} test-only flip`,
    kind: "flip",
    financing: null,
    inputs: {
      purchasePrice: dated(100_000),
      acquisitionFixed: dated(0),
      acquisitionRate: dated(0),
      rehab: dated(0),
      contingencyRate: dated(0),
      holdingMonths: dated(0),
      holdingMonthly: dated(0),
      loanToPurchase: dated(0),
      annualInterestRate: dated(0),
      originationRate: dated(0),
      financingFixed: dated(0),
      salePrice: dated(110_000),
      sellingRate: dated(0),
      sellingFixed: dated(0),
      targetProfit: dated(5_000),
    },
    sensitivity: [
      { name: "Explicit acceptance downside", overrides: { salePrice: dated(105_000) } },
    ],
    candidateSelections: [],
  });
  check(
    scenario.result.evaluation.status === "ok" &&
      scenario.result.evaluation.value?.profit === 10_000,
    "Acceptance scenario did not persist the expected calculated output.",
  );
  const captureScenarioToken = async (id: string, version: number) => {
    const persisted = await db
      .prepare(
        "SELECT operation_token operationToken FROM property_deal_scenarios WHERE id=? AND property_key=? AND version=? AND created_by=? COLLATE NOCASE",
      )
      .bind(id, propertyKey, version, actor)
      .first<{ operationToken: string }>();
    check(
      persisted,
      `Acceptance scenario ownership token was not persisted at version ${version}.`,
    );
    return { id, version, operationToken: persisted.operationToken };
  };
  scenarioToken = await captureScenarioToken(scenario.id, scenario.version);
  const firstScenarioRead = await jsonRequest<{
    scenarios: Array<{ id: string; version: number; name: string }>;
  }>(scenarioPath);
  const firstPartnerScenarioRead = await partnerJsonRequest<typeof firstScenarioRead>(scenarioPath);
  check(
    firstScenarioRead.scenarios.some(
      (entry) => entry.id === scenario.id && entry.version === scenario.version,
    ) &&
      firstPartnerScenarioRead.scenarios.some(
        (entry) => entry.id === scenario.id && entry.version === scenario.version,
      ),
    "Fresh scenario GET was not durable across both authorized sessions.",
  );

  const rentalScenario = await jsonRequest<{
    id: string;
    version: number;
    kind: string;
    result: {
      evaluation: {
        status: string;
        value?: {
          annualCashFlow?: number;
          breakEvenMonthlyRent?: { status: string; amount: number | null };
        };
      };
    };
  }>(scenarioPath, {
    id: scenario.id,
    expectedVersion: scenario.version,
    name: `${label} test-only rental`,
    kind: "rental",
    financing: "cash",
    inputs: {
      purchasePrice: dated(100_000),
      acquisitionFixed: dated(0),
      acquisitionRate: dated(0),
      rehab: dated(0),
      contingencyRate: dated(0),
      stabilizationMonths: dated(0),
      stabilizationMonthly: dated(0),
      loanToPurchase: dated(0),
      annualInterestRate: dated(0),
      originationRate: dated(0),
      financingFixed: dated(0),
      loanTermMonths: dated(0),
      elapsedLoanMonths: dated(0),
      monthlyRent: dated(1_000),
      otherMonthlyIncome: dated(0),
      vacancyRate: dated(0),
      monthlyTaxes: dated(0),
      monthlyInsurance: dated(0),
      monthlyHoa: dated(0),
      otherMonthlyOperating: dated(0),
      maintenanceRate: dated(0),
      managementRate: dated(0),
      monthlyCapex: dated(0),
      targetAllInYield: dated(0.08),
    },
    sensitivity: [],
    candidateSelections: [],
  });
  check(
    rentalScenario.kind === "rental" &&
      rentalScenario.result.evaluation.status === "ok" &&
      rentalScenario.result.evaluation.value?.annualCashFlow === 12_000 &&
      rentalScenario.result.evaluation.value.breakEvenMonthlyRent?.status === "feasible" &&
      rentalScenario.result.evaluation.value.breakEvenMonthlyRent.amount === 0,
    "Explicit rental scenario result did not persist with the expected calculated output.",
  );
  scenarioToken = await captureScenarioToken(rentalScenario.id, rentalScenario.version);
  const rentalReadback = await partnerJsonRequest<{
    scenarios: Array<{ id: string; version: number; kind: string }>;
  }>(scenarioPath);
  check(
    rentalReadback.scenarios.some(
      (entry) =>
        entry.id === rentalScenario.id &&
        entry.version === rentalScenario.version &&
        entry.kind === "rental",
    ),
    "Rental revision was not durable in a fresh second-partner GET.",
  );

  const benchmark = await jsonRequest<{
    id: string;
    version: number;
    cards: Array<{ cardId: string }>;
    status: string;
    canReveal: boolean;
    frozenCriteria: { zips: string[] } | null;
  }>("/api/research/benchmarks", {
    privateName: `${label} internal test-only comparison`,
    market: "norfolk-va",
    asOfDate: new Date().toISOString().slice(0, 10),
    buyBoxId,
    propertyKeys: [propertyKey],
    competitorCsv: `parcel,score\n${target.apn},1\n`,
    tokenHeader: "parcel",
    competitorLabel: `${label} internal test fixture`,
    fileName: `${runId}.csv`,
    mode: "test-only",
    licenseAcknowledged: true,
  });
  check(
    benchmark.status === "reviewing" &&
      !benchmark.canReveal &&
      benchmark.cards.length > 0 &&
      benchmark.frozenCriteria?.zips.length === 0,
    "Blind benchmark was not created with frozen criteria and a closed early-reveal gate.",
  );
  benchmarkToken = { id: benchmark.id, version: benchmark.version };
  const benchmarkPath = `/api/research/benchmarks/${encodeURIComponent(benchmark.id)}`;
  const creatorBenchmarkRead = await jsonRequest<typeof benchmark>(benchmarkPath);
  const partnerBenchmarkRead = await partnerJsonRequest<typeof benchmark>(benchmarkPath);
  check(
    creatorBenchmarkRead.id === benchmark.id &&
      partnerBenchmarkRead.id === benchmark.id &&
      JSON.stringify(creatorBenchmarkRead.cards) === JSON.stringify(partnerBenchmarkRead.cards),
    "Fresh benchmark GET did not preserve one blind order across sessions.",
  );
  const earlyReveal = await request(`${benchmarkPath}/reveal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedVersion: benchmark.version,
      confirmation: "REVEAL SOURCES",
    }),
  });
  const earlyRevealPayload = (await earlyReveal.json()) as { error?: string };
  check(
    earlyReveal.status === 400 && /every assigned reviewer/i.test(earlyRevealPayload.error ?? ""),
    "Benchmark did not reject reveal before complete immutable reviewer×card coverage.",
  );

  const editedBuyBox = await jsonRequest<{ id: string; version: number }>(
    "/api/research/buy-boxes",
    {
      id: buyBoxId,
      expectedVersion: buyBoxVersion,
      name: `${label} edited live criteria`,
      propertyTypes: [],
      jurisdictions: [target.jurisdictionId],
      neighborhoods: [],
      zips: ["23509"],
      sizeBasis: "none",
      minSizeValue: null,
      maxSizeValue: null,
      minValueCents: null,
      maxValueCents: null,
      valueBasis: "assessed_value",
      valueAssumptionLabel: null,
      distressPhases: [],
    },
  );
  buyBoxVersion = editedBuyBox.version;
  const frozenAfterLiveEdit = await partnerJsonRequest<typeof benchmark>(benchmarkPath);
  check(
    frozenAfterLiveEdit.frozenCriteria?.zips.length === 0,
    "Frozen benchmark criteria changed after the live buy box was edited.",
  );

  for (const card of benchmark.cards) {
    const reviewed = await partnerPostJsonRequest<{
      ownReviews: Array<{ cardId: string; version: number }>;
    }>(`${benchmarkPath}/reviews`, {
      cardId: card.cardId,
      expectedVersion: 0,
      useful: "unknown",
      correctness: "unknown",
      researchSeconds: null,
      reason: `${label}: test-only undetermined blind review`,
    });
    check(
      reviewed.ownReviews.find((entry) => entry.cardId === card.cardId)?.version === 1,
      `Blind review for card ${card.cardId} was not persisted.`,
    );
  }
  benchmarkReviewVersion = 1;
  check(benchmarkReviewVersion === 1, "Blind review version was not persisted.");
  const completeCoverage = await jsonRequest<{
    canReveal: boolean;
    metrics: { union: { missingJudgments: number } };
  }>(benchmarkPath);
  check(
    completeCoverage.canReveal && completeCoverage.metrics.union.missingJudgments === 0,
    "Benchmark reveal gate did not open after complete assigned reviewer×card coverage.",
  );
  const revealed = await jsonRequest<{ revealed: boolean; metrics: unknown; version: number }>(
    `${benchmarkPath}/reveal`,
    { expectedVersion: benchmark.version, confirmation: "REVEAL SOURCES" },
  );
  check(revealed.metrics, "Blind benchmark did not reveal metrics.");
  benchmarkToken.version = revealed.version;
  const revealedPartnerRead = await partnerJsonRequest<{ status: string; version: number }>(
    benchmarkPath,
  );
  check(
    revealedPartnerRead.status === "revealed" &&
      revealedPartnerRead.version === benchmarkToken.version,
    "Revealed benchmark was not durable in a fresh second-partner GET.",
  );
  const benchmarkExport = await request(`${benchmarkPath}/export.csv`);
  check(benchmarkExport.ok, `Benchmark export returned ${benchmarkExport.status}.`);
  const benchmarkCsv = await benchmarkExport.text();
  check(
    isClassifiedTestOnlyBenchmarkExport(benchmarkCsv),
    "Test-only benchmark export lacked explicit synthetic classification or made a performance claim.",
  );
  const preferences = await jsonRequest<{ updatedAt: string; version: number }>(
    "/api/research/alert-preferences",
    {
      expectedVersion: originalPreference?.version ?? 0,
      newActivity: Boolean(originalPreference?.new_activity ?? 1),
      worseningActivity: Boolean(originalPreference?.worsening_activity ?? 1),
      dueFollowUps: Boolean(originalPreference?.due_follow_ups ?? 1),
    },
  );
  preferenceUpdatedAt = preferences.updatedAt;
  preferenceVersion = preferences.version;

  const recheck = await jsonRequest<{
    id: string;
    status: string;
    attemptedAt: string;
    fetchedAt: string | null;
    findings: {
      sources: {
        tax: { status: string; recordCount: number };
        code: { status: string; recordCount: number };
      };
    };
  }>(`/api/research/rechecks/${encodeURIComponent(propertyKey)}`, {});
  recheckId = recheck.id;
  check(
    recheck.status === "success" &&
      recheck.fetchedAt &&
      recheck.findings.sources.tax.status === "success" &&
      recheck.findings.sources.code.status === "success",
    "Fresh exact tax/code recheck did not complete; no global verification claim is allowed.",
  );
  const enrichedBrief = await jsonRequest<{
    saleCandidates: Array<{ id: string; qualificationStatus: string }>;
  }>(
    `/api/research/deal-briefs/${encodeURIComponent(propertyKey)}?buyBoxId=${encodeURIComponent(buyBoxId)}`,
  );
  const actualSaleCandidate = enrichedBrief.saleCandidates[0] ?? null;
  scenarioCandidateAcceptance = actualSaleCandidate
    ? "selected_actual_official_candidate"
    : "honest_no_official_candidate_available";
  const finalFlipScenario = await jsonRequest<{
    id: string;
    version: number;
    kind: string;
    result: { evaluation: { status: string; value?: { profit?: number } } };
    saleCandidateReferences: Array<{
      saleId: string;
      savedEvidenceStatus: string;
      currentSourceStatus: string;
    }>;
  }>(scenarioPath, {
    id: rentalScenario.id,
    expectedVersion: rentalScenario.version,
    name: `${label} test-only final flip`,
    kind: "flip",
    financing: null,
    inputs: {
      purchasePrice: dated(100_000),
      acquisitionFixed: dated(0),
      acquisitionRate: dated(0),
      rehab: dated(0),
      contingencyRate: dated(0),
      holdingMonths: dated(0),
      holdingMonthly: dated(0),
      loanToPurchase: dated(0),
      annualInterestRate: dated(0),
      originationRate: dated(0),
      financingFixed: dated(0),
      salePrice: dated(110_000),
      sellingRate: dated(0),
      sellingFixed: dated(0),
      targetProfit: dated(5_000),
    },
    sensitivity: [
      { name: "Explicit acceptance downside", overrides: { salePrice: dated(105_000) } },
    ],
    candidateSelections: actualSaleCandidate
      ? [
          {
            saleId: actualSaleCandidate.id,
            disposition: "selected_support",
            reason: `${label}: persisted official candidate reviewed only as supporting transfer evidence.`,
          },
        ]
      : [],
  });
  check(
    finalFlipScenario.kind === "flip" &&
      finalFlipScenario.result.evaluation.status === "ok" &&
      finalFlipScenario.result.evaluation.value?.profit === 10_000,
    "Safe flip revision did not preserve the expected calculated output.",
  );
  if (actualSaleCandidate) {
    check(
      finalFlipScenario.saleCandidateReferences.some(
        (reference) =>
          reference.saleId === actualSaleCandidate.id &&
          reference.savedEvidenceStatus === "captured" &&
          reference.currentSourceStatus === "unchanged",
      ),
      "Actual official candidate was not persisted with an unchanged frozen evidence snapshot.",
    );
  } else {
    check(
      finalFlipScenario.saleCandidateReferences.length === 0,
      "Scenario fabricated a sale candidate when official enrichment returned none.",
    );
  }
  scenarioToken = await captureScenarioToken(finalFlipScenario.id, finalFlipScenario.version);
  const finalCreatorRead = await jsonRequest<{
    scenarios: Array<{ id: string; version: number; kind: string }>;
  }>(scenarioPath);
  const finalPartnerRead = await partnerJsonRequest<typeof finalCreatorRead>(scenarioPath);
  for (const readback of [finalCreatorRead, finalPartnerRead]) {
    check(
      readback.scenarios.some(
        (entry) =>
          entry.id === finalFlipScenario.id &&
          entry.version === finalFlipScenario.version &&
          entry.kind === "flip",
      ),
      "Final safe scenario edit was not durable in a fresh cross-session GET.",
    );
  }
  const assessment = await jsonRequest<{ id: string; assertions: unknown[] }>(
    `/api/research/assessments/${encodeURIComponent(propertyKey)}`,
    {},
  );
  assessmentId = assessment.id;
  check(assessment.assertions.length > 0, "Attributed assessment contained no sourced facts.");

  const override = await jsonRequest<{ version: number }>(
    `/api/research/qualification-overrides/${encodeURIComponent(propertyKey)}`,
    {
      expectedVersion: 0,
      action: "deprioritize",
      reason: `${label}: temporary reversible bad-lead override.`,
    },
  );
  overrideVersion = override.version;
  overrideAuditId =
    (
      await db
        .prepare(
          "SELECT id FROM property_qualification_override_audit WHERE property_key=? AND version=? AND actor_email=? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(propertyKey, overrideVersion, actor)
        .first<{ id: string }>()
    )?.id ?? null;

  const feedback = await jsonRequest<{ version: number }>(
    `/api/research/feedback/${encodeURIComponent(propertyKey)}`,
    {
      expectedVersion: 0,
      usefulness: "unknown",
      verification: "unknown",
      interest: "unknown",
      outcome: "unknown",
      researchMinutes: null,
      reason: `${label}: test-only undetermined acceptance label; remove after verification.`,
    },
  );
  feedbackVersion = feedback.version;
  feedbackAuditId =
    (
      await db
        .prepare(
          "SELECT id FROM property_feedback_audit WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review' AND version=? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(propertyKey, actor, feedbackVersion)
        .first<{ id: string }>()
    )?.id ?? null;

  rankingToken = await jsonRequest<{ version: number; updatedAt: string }>(
    "/api/research/ranking-profile",
    {
      expectedVersion: originalRanking?.version ?? 0,
      enabled: !(originalRanking?.enabled ?? 0),
      minimumSamples: originalRanking?.minimum_samples ?? 5,
      maximumAdjustment: originalRanking?.maximum_adjustment ?? 10,
      reason: `${label}: temporary ranking toggle; undetermined label remains insufficient.`,
    },
  );
  rankingAuditId =
    (
      await db
        .prepare(
          "SELECT id FROM ranking_adjustment_audit WHERE version=? AND actor_email=? AND reason=? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(
          rankingToken.version,
          actor,
          `${label}: temporary ranking toggle; undetermined label remains insufficient.`,
        )
        .first<{ id: string }>()
    )?.id ?? null;

  const workspace = await jsonRequest<{
    pipeline: Array<{ propertyKey: string; stage: string; assignedTo: string | null }>;
    buyBoxes: Array<{ id: string }>;
    alerts: Array<{ id: string; propertyKey: string; kind: string; readAt: string | null }>;
  }>("/api/research/workspace");
  const partnerWorkspace = await partnerJsonRequest<typeof workspace>("/api/research/workspace");
  const current = workspace.pipeline.find((row) => row.propertyKey === propertyKey);
  check(
    current?.stage === "Researching" && current.assignedTo === partner,
    "Shared pipeline mutation was not visible.",
  );
  check(
    workspace.buyBoxes.some((row) => row.id === buyBoxId),
    "Temporary buy box was not visible.",
  );
  const partnerCurrent = partnerWorkspace.pipeline.find((row) => row.propertyKey === propertyKey);
  check(
    partnerCurrent?.stage === "Researching" && partnerCurrent.assignedTo === partner,
    "Shared pipeline mutation was not visible to the second authorized partner.",
  );
  check(
    partnerWorkspace.buyBoxes.some((row) => row.id === buyBoxId),
    "Temporary buy box was not shared with the second authorized partner.",
  );
  const due = workspace.alerts.find(
    (alert) => alert.propertyKey === propertyKey && alert.kind === "due_follow_up",
  );
  check(due, "Due follow-up alert was not generated.");
  dueAlertIds = [
    ...new Set(
      [...workspace.alerts, ...partnerWorkspace.alerts]
        .filter((alert) => alert.propertyKey === propertyKey && alert.kind === "due_follow_up")
        .map((alert) => alert.id),
    ),
  ];
  await jsonRequest("/api/research/alerts/read", { ids: [due.id] });
  const brief = await partnerJsonRequest<{
    notes: Array<{ id: string }>;
    pipeline: { version: number } | null;
    buyingFit: { status: string };
    decisionSupport: {
      assessments: Array<{ id: string }>;
      qualification: { override: { version: number } | null };
      feedback: Array<{ reviewerEmail: string; version: number }>;
    };
  }>(
    `/api/research/deal-briefs/${encodeURIComponent(propertyKey)}?buyBoxId=${encodeURIComponent(buyBoxId)}`,
  );
  check(
    brief.notes.some((entry) => entry.id === noteId),
    "Temporary attributed note was not visible in the deal brief.",
  );
  check(
    brief.pipeline?.version === latestPipelineVersion,
    "Deal brief did not return current shared state.",
  );
  check(
    brief.decisionSupport.assessments.some((entry) => entry.id === assessmentId),
    "Assessment was not visible to the second authorized partner.",
  );
  check(
    brief.decisionSupport.qualification.override?.version === overrideVersion,
    "Qualification override was not visible to the second authorized partner.",
  );
  check(
    brief.decisionSupport.feedback.some(
      (entry) => entry.reviewerEmail === actor && entry.version === feedbackVersion,
    ),
    "Feedback was not visible to the second authorized partner.",
  );

  const exportResponse = await request("/api/research/export-selected.csv", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ propertyKeys: [propertyKey] }),
  });
  check(exportResponse.ok, `Selected export returned ${exportResponse.status}.`);
  const csv = await exportResponse.text();
  check(csv.includes(propertyKey), "Selected export omitted the exact target property.");
  check(csv.trim().split("\n").length > 1, "Selected export contained no evidence rows.");

  const passed = await jsonRequest<{
    version: number;
    updatedAt: string;
    followUpAt: string | null;
  }>(`/api/research/pipeline/${encodeURIComponent(propertyKey)}`, {
    expectedVersion: latestPipelineVersion,
    patch: { stage: "Passed", passReason: `${label}: reversible acceptance pass reason.` },
  });
  latestPipelineVersion = passed.version;
  latestPipelineUpdatedAt = passed.updatedAt;
  check(passed.followUpAt === null, "Passing a property did not clear its follow-up.");
  const afterPass = await jsonRequest<{ alerts: Array<{ propertyKey: string; kind: string }> }>(
    "/api/research/workspace",
  );
  check(
    !afterPass.alerts.some(
      (alert) => alert.propertyKey === propertyKey && alert.kind === "due_follow_up",
    ),
    "Passed property retained a stale due alert.",
  );
} catch (error) {
  workflowFailure = error;
  console.error(
    JSON.stringify({
      phase: "workflow",
      propertyKey,
      runId,
      error: error instanceof Error ? error.message : "unknown",
    }),
  );
}

let cleanupFailure: unknown = null;
try {
  const officialBeforeCleanup = await readOfficialData(db, propertyKey, recheckId);
  const statements: Array<ReturnType<typeof db.prepare>> = [
    acceptanceCleanupGuard(db as unknown as D1Database, {
      propertyKey,
      ...(latestPipelineVersion !== null && latestPipelineUpdatedAt
        ? {
            pipelineVersion: latestPipelineVersion,
            pipelineUpdatedAt: latestPipelineUpdatedAt,
          }
        : {}),
      ...(preferenceVersion !== null ? { preferenceUserEmail: actor, preferenceVersion } : {}),
      ...(rankingToken
        ? {
            rankingProfileVersion: rankingToken.version,
            rankingProfileUpdatedAt: rankingToken.updatedAt,
          }
        : {}),
      ...(scenarioToken
        ? {
            scenarioId: scenarioToken.id,
            scenarioVersion: scenarioToken.version,
            scenarioOperationToken: scenarioToken.operationToken,
          }
        : {}),
      ...(buyBoxId && buyBoxVersion !== null
        ? { buyBoxId, buyBoxVersion, buyBoxCreatedBy: actor }
        : {}),
      ...(benchmarkToken
        ? {
            benchmarkId: benchmarkToken.id,
            benchmarkVersion: benchmarkToken.version,
            benchmarkCreatedBy: actor,
          }
        : {}),
    }) as unknown as ReturnType<typeof db.prepare>,
  ];
  if (noteId) {
    statements.push(
      db
        .prepare("DELETE FROM property_notes WHERE id=? AND property_key=? AND author_email=?")
        .bind(noteId, propertyKey, actor),
    );
  }
  if (buyBoxId) {
    statements.push(
      db
        .prepare("DELETE FROM buy_boxes WHERE id=? AND version=? AND created_by=? COLLATE NOCASE")
        .bind(buyBoxId, buyBoxVersion, actor),
    );
  }
  if (scenarioToken) {
    statements.push(
      db
        .prepare("DELETE FROM property_deal_scenario_candidates WHERE scenario_id=?")
        .bind(scenarioToken.id),
      db
        .prepare(
          "DELETE FROM property_deal_scenarios WHERE id=? AND property_key=? AND version=? AND operation_token=? AND created_by=?",
        )
        .bind(
          scenarioToken.id,
          propertyKey,
          scenarioToken.version,
          scenarioToken.operationToken,
          actor,
        ),
    );
  }
  if (benchmarkToken) {
    statements.push(
      db
        .prepare("DELETE FROM blind_benchmark_review_audit WHERE benchmark_id=?")
        .bind(benchmarkToken.id),
      db
        .prepare(
          "DELETE FROM blind_benchmark_reviews WHERE benchmark_id=? AND reviewer_email=? COLLATE NOCASE AND version=?",
        )
        .bind(benchmarkToken.id, partner, benchmarkReviewVersion),
      db
        .prepare("DELETE FROM blind_benchmark_imports WHERE benchmark_id=?")
        .bind(benchmarkToken.id),
      db
        .prepare(
          "DELETE FROM blind_benchmarks WHERE id=? AND version=? AND created_by=? COLLATE NOCASE",
        )
        .bind(benchmarkToken.id, benchmarkToken.version, actor),
    );
  }
  for (const alertId of dueAlertIds) {
    statements.push(
      db
        .prepare(
          "DELETE FROM property_alerts WHERE id=? AND property_key=? AND kind='due_follow_up'",
        )
        .bind(alertId, propertyKey),
    );
  }
  if (assessmentId) {
    statements.push(
      db
        .prepare("DELETE FROM property_assessments WHERE id=? AND property_key=? AND created_by=?")
        .bind(assessmentId, propertyKey, actor),
    );
  }
  if (overrideAuditId) {
    statements.push(
      db
        .prepare(
          "DELETE FROM property_qualification_override_audit WHERE id=? AND property_key=? AND actor_email=?",
        )
        .bind(overrideAuditId, propertyKey, actor),
    );
  }
  if (overrideVersion !== null) {
    statements.push(
      db
        .prepare(
          "DELETE FROM property_qualification_overrides WHERE property_key=? AND version=? AND updated_by=?",
        )
        .bind(propertyKey, overrideVersion, actor),
    );
  }
  if (feedbackAuditId) {
    statements.push(
      db
        .prepare(
          "DELETE FROM property_feedback_audit WHERE id=? AND property_key=? AND reviewer_email=? COLLATE NOCASE",
        )
        .bind(feedbackAuditId, propertyKey, actor),
    );
  }
  if (feedbackVersion !== null) {
    statements.push(
      db
        .prepare(
          "DELETE FROM property_feedback WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review' AND version=?",
        )
        .bind(propertyKey, actor, feedbackVersion),
    );
  }
  if (rankingAuditId) {
    statements.push(
      db
        .prepare("DELETE FROM ranking_adjustment_audit WHERE id=? AND actor_email=?")
        .bind(rankingAuditId, actor),
    );
  }
  if (rankingToken && originalRanking) {
    statements.push(
      db
        .prepare(
          "UPDATE ranking_adjustment_profile SET enabled=?,minimum_samples=?,maximum_adjustment=?,reason=?,version=?,updated_at=?,updated_by=?,operation_token=? WHERE id='shared' AND version=? AND updated_at=?",
        )
        .bind(
          originalRanking.enabled,
          originalRanking.minimum_samples,
          originalRanking.maximum_adjustment,
          originalRanking.reason,
          originalRanking.version,
          originalRanking.updated_at,
          originalRanking.updated_by,
          originalRanking.operation_token,
          rankingToken.version,
          rankingToken.updatedAt,
        ),
    );
  } else if (rankingToken) {
    statements.push(
      db
        .prepare(
          "DELETE FROM ranking_adjustment_profile WHERE id='shared' AND version=? AND updated_at=?",
        )
        .bind(rankingToken.version, rankingToken.updatedAt),
    );
  }
  if (preferenceVersion !== null && originalPreference) {
    statements.push(
      db
        .prepare(
          "UPDATE user_alert_preferences SET new_activity=?,worsening_activity=?,due_follow_ups=?,updated_at=?,version=? WHERE user_email=? COLLATE NOCASE AND version=?",
        )
        .bind(
          originalPreference.new_activity,
          originalPreference.worsening_activity,
          originalPreference.due_follow_ups,
          originalPreference.updated_at,
          originalPreference.version,
          actor,
          preferenceVersion,
        ),
    );
  } else if (preferenceVersion !== null) {
    statements.push(
      db
        .prepare(
          "DELETE FROM user_alert_preferences WHERE user_email=? COLLATE NOCASE AND version=?",
        )
        .bind(actor, preferenceVersion),
    );
  }
  if (latestPipelineVersion !== null && latestPipelineUpdatedAt) {
    statements.push(
      db
        .prepare(
          "DELETE FROM partner_properties WHERE property_key=? AND version=? AND updated_at=? AND updated_by=?",
        )
        .bind(propertyKey, latestPipelineVersion, latestPipelineUpdatedAt, actor),
    );
  }
  const cleanup = await db.batch(statements);
  check(
    cleanup.every((result) => result.success),
    "Guarded cleanup batch failed.",
  );
  const restoredPipeline = await db
    .prepare("SELECT * FROM partner_properties WHERE property_key=?")
    .bind(propertyKey)
    .first<PipelineRow>();
  check(
    JSON.stringify(restoredPipeline) === JSON.stringify(originalPipeline),
    "Pipeline state was not restored exactly.",
  );
  const restoredPreference = await db
    .prepare("SELECT * FROM user_alert_preferences WHERE user_email=? COLLATE NOCASE")
    .bind(actor)
    .first<PreferenceRow>();
  check(
    JSON.stringify(restoredPreference) === JSON.stringify(originalPreference),
    "Preference state was not restored exactly.",
  );
  const restoredRanking = await db
    .prepare("SELECT * FROM ranking_adjustment_profile WHERE id='shared'")
    .first<RankingRow>();
  check(
    JSON.stringify(restoredRanking) === JSON.stringify(originalRanking),
    "Ranking profile was not restored exactly.",
  );
  check(
    !(await db.prepare("SELECT 1 present FROM property_notes WHERE id=?").bind(noteId).first()),
    "Temporary note was not removed.",
  );
  check(
    !(await db.prepare("SELECT 1 present FROM buy_boxes WHERE id=?").bind(buyBoxId).first()),
    "Temporary buy box was not removed.",
  );
  check(
    !scenarioToken ||
      !(await db
        .prepare("SELECT 1 present FROM property_deal_scenarios WHERE id=?")
        .bind(scenarioToken.id)
        .first()),
    "Temporary scenario was not removed.",
  );
  check(
    !benchmarkToken ||
      !(await db
        .prepare("SELECT 1 present FROM blind_benchmarks WHERE id=?")
        .bind(benchmarkToken.id)
        .first()),
    "Temporary benchmark was not removed.",
  );
  for (const alertId of dueAlertIds) {
    check(
      !(await db.prepare("SELECT 1 present FROM property_alerts WHERE id=?").bind(alertId).first()),
      `Temporary alert ${alertId} was not removed.`,
    );
  }
  check(
    !(await db
      .prepare("SELECT 1 present FROM property_assessments WHERE id=?")
      .bind(assessmentId)
      .first()),
    "Temporary assessment was not removed.",
  );
  check(
    !recheckId ||
      Boolean(
        await db
          .prepare("SELECT 1 present FROM property_rechecks WHERE id=?")
          .bind(recheckId)
          .first(),
      ),
    "Official tax/code recheck observation was not retained.",
  );
  check(
    !(await db
      .prepare(
        "SELECT 1 present FROM property_feedback WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND version=?",
      )
      .bind(propertyKey, actor, feedbackVersion)
      .first()),
    "Temporary feedback version was not removed.",
  );
  retainedOfficialData = await readOfficialData(db, propertyKey, recheckId);
  for (const field of Object.keys(officialBeforeCleanup) as Array<keyof OfficialDataCounts>) {
    check(
      retainedOfficialData[field] >= officialBeforeCleanup[field],
      `Cleanup lost official ${field}.`,
    );
  }
  if (!workflowFailure) {
    check(retainedOfficialData.enrichmentRows === 1, "Official enrichment was not retained.");
    check(retainedOfficialData.extensionRows > 0, "Official extension rows were not retained.");
    check(
      retainedOfficialData.enrichmentRuns > 0,
      "Official enrichment-run provenance was not retained.",
    );
    check(
      retainedOfficialData.officialRecheckRows === 1,
      "Official tax/code recheck was not retained.",
    );
  }
  console.log(
    JSON.stringify({ syntheticStateRestored: true, propertyKey, runId, retainedOfficialData }),
  );
} catch (error) {
  cleanupFailure = error;
}

if (cleanupFailure) {
  console.error(
    JSON.stringify(
      {
        message: "Guarded cleanup requires manual recovery; no unguarded overwrite was attempted.",
        propertyKey,
        runId,
        pipelineToken: { version: latestPipelineVersion, updatedAt: latestPipelineUpdatedAt },
        preferenceToken: { version: preferenceVersion, updatedAt: preferenceUpdatedAt },
        rankingToken,
        testOwnedIds: {
          noteId,
          buyBoxId,
          assessmentId,
          recheckId,
          overrideAuditId,
          feedbackAuditId,
          rankingAuditId,
          scenarioId: scenarioToken?.id,
          benchmarkId: benchmarkToken?.id,
          dueAlertIds,
        },
        cleanupError: cleanupFailure instanceof Error ? cleanupFailure.message : "unknown",
      },
      null,
      2,
    ),
  );
  throw cleanupFailure;
}
if (workflowFailure) {
  throw workflowFailure;
}

console.log(
  JSON.stringify(
    {
      verified: true,
      propertyKey,
      workflow: [
        "actual_d1_rollback_sentinel",
        "two_partner_shared_state",
        "saved",
        "assigned",
        "stage",
        "follow_up",
        "alert_read",
        "note",
        "buy_box",
        "actual_d1_qualification_buy_box_query",
        "calculated_test_only_flip_rental_flip_scenario_with_cross_session_gets",
        "actual_candidate_snapshot_when_officially_available",
        "blind_internal_benchmark_early_reveal_rejection_complete_review_frozen_criteria_export",
        "selected_export",
        "fresh_public_recheck",
        "attributed_assessment",
        "qualification_override",
        "undetermined_test_feedback",
        "ranking_toggle_reset",
        "passed_cleanup",
      ],
      retainedProductData: [
        "official_enrichment",
        "official_extension_rows",
        "official_sale_candidates",
        "enrichment_run",
        "official_tax_code_recheck",
      ],
      retainedOfficialData,
      scenarioCandidateAcceptance,
      providerQueryDiagnostics,
      actualD1Usage: db.usageSummary(),
      restored: true,
    },
    null,
    2,
  ),
);
