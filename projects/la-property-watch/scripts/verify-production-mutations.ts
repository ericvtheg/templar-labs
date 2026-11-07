import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { CloudflareD1 } from "./ingest-production.ts";
import { acceptanceCleanupGuard } from "./mutation-acceptance-cleanup.ts";

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

const db = new CloudflareD1({ accountId, apiToken });
await db.discover();
const requestedKey = process.env["PROPERTY_KEY"];
const targetSql = `SELECT r.property_key propertyKey,MAX(r.jurisdiction_id) jurisdictionId,MAX(r.apn) apn
  FROM foreclosure_records r
  WHERE r.jurisdiction_id='norfolk-va' AND LENGTH(r.apn)=8 AND r.apn NOT GLOB '*[^0-9]*'
    ${requestedKey ? "AND r.property_key=?" : ""}
    AND NOT EXISTS (SELECT 1 FROM partner_properties p WHERE p.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_alerts a WHERE a.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_notes n WHERE n.property_key=r.property_key)
    AND NOT EXISTS (SELECT 1 FROM property_value_assumptions v WHERE v.property_key=r.property_key)
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
let assessmentId: string | null = null;
let recheckId: string | null = null;
let overrideVersion: number | null = null;
let feedbackVersion: number | null = null;
let overrideAuditId: string | null = null;
let feedbackAuditId: string | null = null;
let rankingAuditId: string | null = null;
let rankingToken: { version: number; updatedAt: string } | null = null;
let dueAlertIds: string[] = [];
let retainedOfficialData: {
  enrichmentRows: number;
  extensionRows: number;
  saleCandidateRows: number;
  enrichmentRuns: number;
  officialRecheckRows: number;
} | null = null;
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
  const note = await jsonRequest<{ id: string }>(
    `/api/research/notes/${encodeURIComponent(propertyKey)}`,
    {
      body: noteBody,
    },
  );
  noteId = note.id;
  const buyBox = await jsonRequest<{ id: string }>("/api/research/buy-boxes", {
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
}

let cleanupFailure: unknown = null;
try {
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
      db.prepare("DELETE FROM buy_boxes WHERE id=? AND created_by=?").bind(buyBoxId, actor),
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
  const official = await db
    .prepare(`SELECT
    (SELECT COUNT(*) FROM property_enrichment WHERE property_key=?) enrichment_rows,
    (SELECT COUNT(*) FROM property_enrichment_extensions WHERE property_key=?) extension_rows,
    (SELECT COUNT(*) FROM property_sales WHERE subject_property_key=?) sale_candidate_rows,
    (SELECT COUNT(*) FROM enrichment_runs WHERE property_key=? AND status='success') enrichment_runs,
    (SELECT COUNT(*) FROM property_rechecks WHERE property_key=? AND id=?) official_recheck_rows`)
    .bind(propertyKey, propertyKey, propertyKey, propertyKey, propertyKey, recheckId)
    .first<{
      enrichment_rows: number;
      extension_rows: number;
      sale_candidate_rows: number;
      enrichment_runs: number;
      official_recheck_rows: number;
    }>();
  retainedOfficialData = {
    enrichmentRows: Number(official?.enrichment_rows ?? 0),
    extensionRows: Number(official?.extension_rows ?? 0),
    saleCandidateRows: Number(official?.sale_candidate_rows ?? 0),
    enrichmentRuns: Number(official?.enrichment_runs ?? 0),
    officialRecheckRows: Number(official?.official_recheck_rows ?? 0),
  };
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
        "two_partner_shared_state",
        "saved",
        "assigned",
        "stage",
        "follow_up",
        "alert_read",
        "note",
        "buy_box",
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
      restored: true,
    },
    null,
    2,
  ),
);
