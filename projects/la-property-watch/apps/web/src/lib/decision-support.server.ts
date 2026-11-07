import {
  canonicalSignalCombination,
  evidenceLink,
  evidenceStatusState,
  normalizeOwnerName,
} from "./evidence-semantics.ts";
import { canonicalPartnerEmail, type SignalType } from "./model.ts";
import { fetchNorfolkDealData, persistNorfolkDealData } from "./norfolk-deal-data.ts";
import { fetchNorfolkDistressEvidence, type RecheckSourceFinding } from "./norfolk-recheck.ts";

export type QualificationStatus = "qualified" | "needs_research" | "deprioritized";
export type QualificationOverrideAction = "source_only" | "qualify" | "deprioritize";
export type FeedbackInput = {
  expectedVersion: number;
  usefulness: "useful" | "not_useful" | "unknown";
  verification: "unresolved" | "wrong_match" | "stale" | "resolved" | "unknown";
  interest: "investigate" | "not_interested" | "unknown";
  outcome: "none" | "offer_made" | "closed" | "unknown";
  researchMinutes: number | null;
  reason: string;
};

export class DecisionValidationError extends Error {}
export class DecisionConflictError extends Error {}

type BuyingFitContext = {
  status: "match" | "no_match" | "unknown";
  reasons: readonly string[];
  missingInputs: readonly string[];
};

type EvidenceRow = {
  id: string;
  signal_type: SignalType;
  source_record_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_document_url: string | null;
  source_as_of_date: string | null;
  source_updated_at: string | null;
  source_published_at: string | null;
  observed_at: string;
  event_date: string | null;
  evidence_updated_at: string | null;
  evidence_status: string | null;
  evidence_detail: string | null;
  snapshot_presence: string;
  apn: string | null;
  owner_name: string | null;
  tax_year: number | null;
  tax_installment: number | null;
};

type EnrichmentRow = {
  owner_name: string | null;
  owner_source_url: string | null;
  owner_observed_at: string | null;
  last_transfer_date: string | null;
  last_transfer_consideration_cents: number | null;
  last_transfer_document_number: string | null;
  last_transfer_grantor: string | null;
  last_transfer_grantee: string | null;
  assessment_source_url: string | null;
  source_updated_at: string | null;
  observed_at: string;
};

type OverrideRow = {
  property_key: string;
  action: QualificationOverrideAction;
  reason: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  operation_token: string;
};

type FeedbackRow = {
  property_key: string;
  reviewer_email: string;
  data_source: string;
  usefulness: FeedbackInput["usefulness"];
  verification: FeedbackInput["verification"];
  interest: FeedbackInput["interest"];
  outcome: FeedbackInput["outcome"];
  research_minutes: number | null;
  reason: string;
  market_context: string;
  signal_combination_context: string;
  version: number;
  created_at: string;
  updated_at: string;
  operation_token: string;
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

export async function createPropertyAssessment(
  db: D1Database,
  actor: string,
  propertyKey: string,
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  validatePropertyKey(propertyKey);
  await assertKnownProperty(db, propertyKey);
  const [evidenceResult, enrichment, latestRecheck, versionRow] = await Promise.all([
    db
      .prepare(
        "SELECT id,signal_type,source_record_id,source_id,source_name,source_url,source_document_url,source_as_of_date,source_updated_at,source_published_at,observed_at,event_date,evidence_updated_at,evidence_status,evidence_detail,snapshot_presence,apn,owner_name,tax_year,tax_installment FROM foreclosure_records WHERE property_key=? ORDER BY snapshot_presence='present' DESC,COALESCE(event_date,evidence_updated_at,source_as_of_date,source_updated_at,observed_at) DESC,id",
      )
      .bind(propertyKey)
      .all<EvidenceRow>(),
    db
      .prepare(
        "SELECT owner_name,owner_source_url,owner_observed_at,last_transfer_date,last_transfer_consideration_cents,last_transfer_document_number,last_transfer_grantor,last_transfer_grantee,assessment_source_url,source_updated_at,observed_at FROM property_enrichment WHERE property_key=?",
      )
      .bind(propertyKey)
      .first<EnrichmentRow>(),
    db
      .prepare(
        "SELECT * FROM property_rechecks WHERE property_key=? ORDER BY attempted_at DESC,id DESC LIMIT 1",
      )
      .bind(propertyKey)
      .first<RecheckRow>(),
    db
      .prepare(
        "SELECT COALESCE(MAX(version),0) version FROM property_assessments WHERE property_key=?",
      )
      .bind(propertyKey)
      .first<{ version: number }>(),
  ]);
  const evidence = evidenceResult.results;
  const assertions: Array<{
    id: string;
    kind: SignalType | "ownership_record" | "ownership_transfer";
    statement: string;
    publicationStatus: string;
    currentVerification: string;
    recordDate: string;
    eventDate: string | null;
    datasetAsOf: string | null;
    fetchedAt: string;
    sourceId: string;
    sourceRecordId: string;
    sourceName: string;
    sourceUrl: string;
    sourceLinkKind: "exact_record" | "dataset" | "publisher";
  }> = evidence.map((row) => {
    const link = evidenceLink(row);
    return {
      id: row.id,
      kind: row.signal_type,
      statement: `${row.source_name} reports ${row.signal_type.replaceAll("_", " ")}${row.evidence_status ? ` with status “${row.evidence_status}”` : " with no explicit status"}.`,
      publicationStatus: row.evidence_status ?? "status not published",
      currentVerification: verificationForEvidence(row, latestRecheck),
      recordDate:
        row.event_date ??
        row.evidence_updated_at ??
        row.source_as_of_date ??
        row.source_updated_at ??
        row.observed_at,
      eventDate: row.event_date,
      datasetAsOf: row.source_as_of_date ?? row.source_updated_at,
      fetchedAt: row.observed_at,
      sourceId: row.source_id,
      sourceRecordId: row.source_record_id,
      sourceName: row.source_name,
      sourceUrl: link.sourceUrl,
      sourceLinkKind: link.sourceLinkKind,
    };
  });
  const latestFindings = recheckFindings(latestRecheck);
  if (enrichment?.owner_name && enrichment.owner_source_url) {
    assertions.push({
      id: `owner:${propertyKey}:${enrichment.owner_observed_at ?? enrichment.observed_at}`,
      kind: "ownership_record",
      statement: `The official assessor parcel record publishes ${enrichment.owner_name} as owner.`,
      publicationStatus: "owner name as published",
      currentVerification:
        latestFindings?.sources.assessor?.status === "success"
          ? `Assessor parcel facts fetched ${latestFindings.sources.assessor.fetchedAt}; this does not verify tax, code, or legal status.`
          : "Stored parcel observation; a fresh public recheck has not succeeded.",
      recordDate: enrichment.owner_observed_at ?? enrichment.observed_at,
      eventDate: null,
      datasetAsOf: enrichment.source_updated_at,
      fetchedAt: enrichment.owner_observed_at ?? enrichment.observed_at,
      sourceId: "norfolk-fy27-assessor",
      sourceRecordId: propertyKey.slice("norfolk-va:".length),
      sourceName: "City of Norfolk FY27 assessor data",
      sourceUrl: enrichment.owner_source_url,
      sourceLinkKind: "exact_record",
    });
  }
  if (enrichment?.last_transfer_date && enrichment.assessment_source_url) {
    assertions.push({
      id: `transfer:${propertyKey}:${enrichment.last_transfer_document_number ?? enrichment.last_transfer_date}`,
      kind: "ownership_transfer",
      statement: `The parcel record reports a transfer dated ${enrichment.last_transfer_date}${enrichment.last_transfer_document_number ? ` under document ${enrichment.last_transfer_document_number}` : ""}. This is ownership history, not evidence that any debt was extinguished.`,
      publicationStatus: "transfer as published",
      currentVerification:
        "Transfer record does not establish payoff, lien priority, cure, or debt extinction.",
      recordDate: enrichment.last_transfer_date,
      eventDate: enrichment.last_transfer_date,
      datasetAsOf: enrichment.source_updated_at,
      fetchedAt: enrichment.observed_at,
      sourceId: "norfolk-fy27-assessor",
      sourceRecordId: enrichment.last_transfer_document_number ?? propertyKey,
      sourceName: "City of Norfolk FY27 assessor data",
      sourceUrl: enrichment.assessment_source_url,
      sourceLinkKind: "exact_record",
    });
  }
  const rawOwners = [enrichment?.owner_name, ...evidence.map((row) => row.owner_name)].filter(
    (value): value is string => Boolean(value),
  );
  const owners = new Set(rawOwners.map(normalizeOwnerName).filter(Boolean));
  const hasRelease = evidence.some((row) => row.signal_type === "lien_release");
  const hasRecordedLien = evidence.some((row) => row.signal_type === "recorded_lien");
  const contradictions = [
    ...(owners.size > 1
      ? [
          {
            code: "owner_names_differ",
            description: `Published owner names differ across exact source records: ${[...new Set(rawOwners)].join(" · ")}.`,
            evidenceIds: evidence.filter((row) => row.owner_name).map((row) => row.id),
          },
        ]
      : []),
    ...(hasRelease && hasRecordedLien
      ? [
          {
            code: "instrument_specific_release",
            description:
              "A release record and an independent recorded-lien record coexist. The release applies only to its exact instrument; it is not a parcel-wide lien release.",
            evidenceIds: evidence
              .filter(
                (row) => row.signal_type === "lien_release" || row.signal_type === "recorded_lien",
              )
              .map((row) => row.id),
          },
        ]
      : []),
  ];
  const outstandingQuestions = [
    "What is the current status of each exact tax, code, lien, or foreclosure instrument?",
    "Does any release, cure, withdrawal, or stay link to the exact active instrument?",
    "Did a reported ownership transfer change title without resolving an earlier obligation?",
    "Are identity, condition, current payoff, acquisition price, and market value independently verified?",
  ];
  const reviewedAt = now.toISOString();
  const version = Number(versionRow?.version ?? 0) + 1;
  const assessment = {
    id: crypto.randomUUID(),
    propertyKey,
    version,
    summary: `${assertions.length} attributed facts reviewed; ${contradictions.length} contradiction${contradictions.length === 1 ? "" : "s"} retained; ${outstandingQuestions.length} checks remain open.`,
    evidenceTotal: evidence.length,
    evidenceIncluded: evidence.length,
    evidenceOmitted: 0,
    assertions,
    contradictions,
    outstandingQuestions,
    datasetAsOf:
      latestRecheck?.dataset_as_of ??
      enrichment?.source_updated_at ??
      evidence
        .map((row) => row.source_as_of_date ?? row.source_updated_at)
        .filter(Boolean)
        .toSorted()
        .at(-1) ??
      null,
    fetchedAt:
      latestRecheck?.fetched_at ??
      enrichment?.observed_at ??
      evidence
        .map((row) => row.observed_at)
        .toSorted()
        .at(-1) ??
      null,
    reviewedAt,
    verifiedAt: null,
    createdBy: actorEmail,
  };
  await db
    .prepare(
      "INSERT INTO property_assessments (id,property_key,version,summary,evidence_total,evidence_included,evidence_omitted,assertions_json,contradictions_json,outstanding_questions_json,dataset_as_of,fetched_at,reviewed_at,verified_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      assessment.id,
      propertyKey,
      version,
      assessment.summary,
      assessment.evidenceTotal,
      assessment.evidenceIncluded,
      assessment.evidenceOmitted,
      JSON.stringify(assertions),
      JSON.stringify(contradictions),
      JSON.stringify(outstandingQuestions),
      assessment.datasetAsOf,
      assessment.fetchedAt,
      reviewedAt,
      assessment.verifiedAt,
      actorEmail,
    )
    .run();
  return assessment;
}

export async function recheckSelectedProperty(
  db: D1Database,
  actor: string,
  propertyKey: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  validatePropertyKey(propertyKey);
  await assertKnownProperty(db, propertyKey);
  const match = propertyKey.match(/^norfolk-va:(\d{8})$/);
  if (!match?.[1]) {
    throw new DecisionValidationError(
      "A safe fresh property recheck is currently available only for exact eight-digit Norfolk public parcel IDs.",
    );
  }
  const attemptedAt = now.toISOString();
  const id = crypto.randomUUID();
  const [distressResult, assessorResult] = await Promise.allSettled([
    fetchNorfolkDistressEvidence(fetchImpl, match[1], now),
    fetchNorfolkDealData(fetchImpl, match[1], now),
  ]);
  let assessorPersistenceError: string | null = null;
  if (assessorResult.status === "fulfilled") {
    try {
      const data = assessorResult.value;
      // Official enrichment is retained product fact. The recheck never rewrites
      // foreclosure_records or source publication/change state.
      await persistNorfolkDealData(db, data);
    } catch (cause) {
      assessorPersistenceError = safeError(cause);
    }
  }
  const distress =
    distressResult.status === "fulfilled"
      ? distressResult.value
      : {
          tax: failedSourceFinding(
            "norfolk-delinquent-property-tax",
            "City of Norfolk · Delinquent Property Taxes",
            safeError(distressResult.reason),
          ),
          code: failedSourceFinding(
            "norfolk-code-violations",
            "City of Norfolk · Neighborhood Quality Violations",
            safeError(distressResult.reason),
          ),
        };
  const assessor: RecheckSourceFinding =
    assessorResult.status === "fulfilled" && !assessorPersistenceError
      ? {
          sourceId: "norfolk-fy27-assessor",
          sourceName: "City of Norfolk FY27 assessor data",
          status: "success",
          presence: "present",
          fetchedAt: assessorResult.value.observedAt,
          publicationAsOf: assessorResult.value.sourceUpdatedAt,
          sourceAsOf: assessorResult.value.sourceUpdatedAt,
          metadataUrl: "https://data.norfolk.gov/api/views/qva7-tzrf.json",
          queryUrl: assessorResult.value.enrichment.joinSourceUrl,
          recordCount: assessorResult.value.extensions.length,
          records: [],
          boundary:
            "Assessor facts were refreshed. They do not verify tax, code, lien, foreclosure, payoff, or resolution status.",
          error: null,
        }
      : failedSourceFinding(
          "norfolk-fy27-assessor",
          "City of Norfolk FY27 assessor data",
          assessorPersistenceError ??
            safeError(assessorResult.status === "rejected" ? assessorResult.reason : null),
        );
  const legal: RecheckSourceFinding = {
    sourceId: "norfolk-legal-status",
    sourceName: "Norfolk legal instrument status",
    status: "unsupported",
    presence: "unknown",
    fetchedAt: null,
    publicationAsOf: null,
    sourceAsOf: null,
    metadataUrl: null,
    queryUrl: null,
    recordCount: 0,
    records: [],
    boundary:
      "No safe accessible exact-property Norfolk legal payoff/release lookup is configured; retained legal records require exact-instrument confirmation.",
    error: null,
  };
  const findings: RecheckFindings = {
    version: 1,
    parcelId: match[1],
    attemptedAt,
    sources: { tax: distress.tax, code: distress.code, assessor, legal },
  };
  const distressSuccesses = [distress.tax, distress.code].filter(
    (finding) => finding.status === "success",
  ).length;
  const status =
    distressSuccesses === 2 ? "success" : distressSuccesses === 1 ? "partial" : "failed";
  const sourceDates = [distress.tax.sourceAsOf, distress.code.sourceAsOf]
    .filter((value): value is string => Boolean(value))
    .toSorted();
  const errors = [distress.tax, distress.code, assessor]
    .filter((finding) => finding.status === "failed")
    .map((finding) => `${finding.sourceName}: ${finding.error ?? "lookup failed"}`);
  const result = {
    id,
    propertyKey,
    sourceId: "norfolk-official-selected-property",
    status,
    attemptedAt,
    fetchedAt: distressSuccesses > 0 ? attemptedAt : null,
    datasetAsOf: sourceDates.at(-1) ?? null,
    // Source publication checks are not independent current-payoff verification.
    verifiedAt: null,
    findings,
    actorEmail,
    error: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
  };
  await insertRecheck(db, result);
  return result;
}

export async function updateQualificationOverride(
  db: D1Database,
  actor: string,
  propertyKey: string,
  input: { expectedVersion: number; action: QualificationOverrideAction; reason: string },
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  validatePropertyKey(propertyKey);
  await assertKnownProperty(db, propertyKey);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new DecisionValidationError("Qualification override version is invalid.");
  }
  if (!new Set(["source_only", "qualify", "deprioritize"]).has(input.action)) {
    throw new DecisionValidationError("Qualification override action is invalid.");
  }
  const reason = validReason(input.reason, "Qualification override reason");
  const existing = await db
    .prepare("SELECT * FROM property_qualification_overrides WHERE property_key=?")
    .bind(propertyKey)
    .first<OverrideRow>();
  if ((existing?.version ?? 0) !== input.expectedVersion) {
    throw new DecisionConflictError("The qualification override changed; reload before saving.");
  }
  const timestamp = now.toISOString();
  const version = input.expectedVersion + 1;
  const operationToken = crypto.randomUUID();
  const state = existing
    ? db
        .prepare(
          "UPDATE property_qualification_overrides SET action=?,reason=?,version=?,updated_at=?,updated_by=?,operation_token=? WHERE property_key=? AND version=?",
        )
        .bind(
          input.action,
          reason,
          version,
          timestamp,
          actorEmail,
          operationToken,
          propertyKey,
          input.expectedVersion,
        )
    : db
        .prepare(
          "INSERT OR IGNORE INTO property_qualification_overrides (property_key,action,reason,version,created_at,created_by,updated_at,updated_by,operation_token) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          propertyKey,
          input.action,
          reason,
          version,
          timestamp,
          actorEmail,
          timestamp,
          actorEmail,
          operationToken,
        );
  const auditId = crypto.randomUUID();
  const results = await db.batch([
    state,
    db
      .prepare(
        "INSERT INTO property_qualification_override_audit (id,property_key,action,reason,version,actor_email,created_at,operation_token) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM property_qualification_overrides WHERE property_key=? AND version=? AND operation_token=?)",
      )
      .bind(
        auditId,
        propertyKey,
        input.action,
        reason,
        version,
        actorEmail,
        timestamp,
        operationToken,
        propertyKey,
        version,
        operationToken,
      ),
  ]);
  if (!results[0]?.meta.changes || !results[1]?.meta.changes) {
    throw new DecisionConflictError("The qualification override changed; reload before saving.");
  }
  return mapOverride(
    (await db
      .prepare("SELECT * FROM property_qualification_overrides WHERE property_key=?")
      .bind(propertyKey)
      .first<OverrideRow>())!,
  );
}

export async function upsertPropertyFeedback(
  db: D1Database,
  actor: string,
  propertyKey: string,
  raw: FeedbackInput,
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  validatePropertyKey(propertyKey);
  await assertKnownProperty(db, propertyKey);
  const input = validateFeedback(raw);
  const existing = await db
    .prepare(
      "SELECT * FROM property_feedback WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review'",
    )
    .bind(propertyKey, actorEmail)
    .first<FeedbackRow>();
  if ((existing?.version ?? 0) !== input.expectedVersion) {
    throw new DecisionConflictError("The feedback changed; reload before saving.");
  }
  const context = await propertyContext(db, propertyKey);
  const timestamp = now.toISOString();
  const version = input.expectedVersion + 1;
  const operationToken = crypto.randomUUID();
  const values = [
    input.usefulness,
    input.verification,
    input.interest,
    input.outcome,
    input.researchMinutes,
    input.reason,
    context.market,
    context.signals,
  ] as const;
  const state = existing
    ? db
        .prepare(
          "UPDATE property_feedback SET usefulness=?,verification=?,interest=?,outcome=?,research_minutes=?,reason=?,market_context=?,signal_combination_context=?,version=?,updated_at=?,operation_token=? WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review' AND version=?",
        )
        .bind(
          ...values,
          version,
          timestamp,
          operationToken,
          propertyKey,
          actorEmail,
          input.expectedVersion,
        )
    : db
        .prepare(
          "INSERT OR IGNORE INTO property_feedback (property_key,reviewer_email,data_source,usefulness,verification,interest,outcome,research_minutes,reason,market_context,signal_combination_context,version,created_at,updated_at,operation_token) VALUES (?,?,'partner_review',?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(propertyKey, actorEmail, ...values, version, timestamp, timestamp, operationToken);
  const auditId = crypto.randomUUID();
  const result = await db.batch([
    state,
    db
      .prepare(
        "INSERT INTO property_feedback_audit (id,property_key,reviewer_email,data_source,usefulness,verification,interest,outcome,research_minutes,reason,market_context,signal_combination_context,version,created_at,operation_token) SELECT ?,?,?,'partner_review',?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM property_feedback WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review' AND version=? AND operation_token=?)",
      )
      .bind(
        auditId,
        propertyKey,
        actorEmail,
        ...values,
        version,
        timestamp,
        operationToken,
        propertyKey,
        actorEmail,
        version,
        operationToken,
      ),
  ]);
  if (!result[0]?.meta.changes || !result[1]?.meta.changes) {
    throw new DecisionConflictError("The feedback changed; reload before saving.");
  }
  return mapFeedback(
    (await db
      .prepare(
        "SELECT * FROM property_feedback WHERE property_key=? AND reviewer_email=? COLLATE NOCASE AND data_source='partner_review'",
      )
      .bind(propertyKey, actorEmail)
      .first<FeedbackRow>())!,
  );
}

export async function updateRankingProfile(
  db: D1Database,
  actor: string,
  input: {
    expectedVersion: number;
    enabled: boolean;
    minimumSamples: number;
    maximumAdjustment: number;
    reason: string;
  },
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new DecisionValidationError("Ranking profile version is invalid.");
  }
  if (typeof input.enabled !== "boolean") {
    throw new DecisionValidationError("Ranking adjustment enabled must be a boolean.");
  }
  if (
    !Number.isInteger(input.minimumSamples) ||
    input.minimumSamples < 3 ||
    input.minimumSamples > 100
  ) {
    throw new DecisionValidationError("Minimum samples must be an integer from 3 to 100.");
  }
  if (
    !Number.isInteger(input.maximumAdjustment) ||
    input.maximumAdjustment < 1 ||
    input.maximumAdjustment > 20
  ) {
    throw new DecisionValidationError("Maximum adjustment must be an integer from 1 to 20.");
  }
  const reason = validReason(input.reason, "Ranking profile reason");
  const existing = await db
    .prepare("SELECT * FROM ranking_adjustment_profile WHERE id='shared'")
    .first<RankingRow>();
  if ((existing?.version ?? 0) !== input.expectedVersion) {
    throw new DecisionConflictError("The ranking profile changed; reload before saving.");
  }
  const timestamp = now.toISOString();
  const version = input.expectedVersion + 1;
  const operationToken = crypto.randomUUID();
  const state = existing
    ? db
        .prepare(
          "UPDATE ranking_adjustment_profile SET enabled=?,minimum_samples=?,maximum_adjustment=?,reason=?,version=?,updated_at=?,updated_by=?,operation_token=? WHERE id='shared' AND version=?",
        )
        .bind(
          input.enabled ? 1 : 0,
          input.minimumSamples,
          input.maximumAdjustment,
          reason,
          version,
          timestamp,
          actorEmail,
          operationToken,
          input.expectedVersion,
        )
    : db
        .prepare(
          "INSERT OR IGNORE INTO ranking_adjustment_profile (id,enabled,minimum_samples,maximum_adjustment,reason,version,updated_at,updated_by,operation_token) VALUES ('shared',?,?,?,?,?,?,?,?)",
        )
        .bind(
          input.enabled ? 1 : 0,
          input.minimumSamples,
          input.maximumAdjustment,
          reason,
          version,
          timestamp,
          actorEmail,
          operationToken,
        );
  const results = await db.batch([
    state,
    db
      .prepare(
        "INSERT INTO ranking_adjustment_audit (id,enabled,minimum_samples,maximum_adjustment,reason,version,actor_email,created_at,operation_token) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ranking_adjustment_profile WHERE id='shared' AND version=? AND operation_token=?)",
      )
      .bind(
        crypto.randomUUID(),
        input.enabled ? 1 : 0,
        input.minimumSamples,
        input.maximumAdjustment,
        reason,
        version,
        actorEmail,
        timestamp,
        operationToken,
        version,
        operationToken,
      ),
  ]);
  if (!results[0]?.meta.changes || !results[1]?.meta.changes) {
    throw new DecisionConflictError("The ranking profile changed; reload before saving.");
  }
  return mapRankingProfile(
    (await db
      .prepare("SELECT * FROM ranking_adjustment_profile WHERE id='shared'")
      .first<RankingRow>())!,
  );
}

export async function loadDecisionSupport(
  db: D1Database,
  propertyKey: string,
  buyingFit: BuyingFitContext | null,
  now = new Date(),
) {
  validatePropertyKey(propertyKey);
  const [
    evidenceResult,
    enrichment,
    override,
    overrideAudit,
    assessments,
    rechecks,
    feedback,
    feedbackAudit,
    profile,
    rankingAudit,
    performanceRows,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT id,signal_type,source_record_id,source_id,source_name,source_url,source_document_url,source_as_of_date,source_updated_at,source_published_at,observed_at,event_date,evidence_updated_at,evidence_status,evidence_detail,snapshot_presence,apn,owner_name,tax_year,tax_installment FROM foreclosure_records WHERE property_key=? ORDER BY id",
      )
      .bind(propertyKey)
      .all<EvidenceRow>(),
    db
      .prepare(
        "SELECT owner_name,owner_source_url,owner_observed_at,last_transfer_date,last_transfer_consideration_cents,last_transfer_document_number,last_transfer_grantor,last_transfer_grantee,assessment_source_url,source_updated_at,observed_at FROM property_enrichment WHERE property_key=?",
      )
      .bind(propertyKey)
      .first<EnrichmentRow>(),
    db
      .prepare("SELECT * FROM property_qualification_overrides WHERE property_key=?")
      .bind(propertyKey)
      .first<OverrideRow>(),
    db
      .prepare(
        "SELECT * FROM property_qualification_override_audit WHERE property_key=? ORDER BY created_at DESC,id DESC",
      )
      .bind(propertyKey)
      .all<{
        id: string;
        action: QualificationOverrideAction;
        reason: string;
        version: number;
        actor_email: string;
        created_at: string;
      }>(),
    db
      .prepare("SELECT * FROM property_assessments WHERE property_key=? ORDER BY version DESC")
      .bind(propertyKey)
      .all<AssessmentRow>(),
    db
      .prepare(
        "SELECT * FROM property_rechecks WHERE property_key=? ORDER BY attempted_at DESC,id DESC",
      )
      .bind(propertyKey)
      .all<RecheckRow>(),
    db
      .prepare(
        "SELECT * FROM property_feedback WHERE property_key=? AND data_source='partner_review' ORDER BY reviewer_email",
      )
      .bind(propertyKey)
      .all<FeedbackRow>(),
    db
      .prepare(
        "SELECT * FROM property_feedback_audit WHERE property_key=? AND data_source='partner_review' ORDER BY created_at,id",
      )
      .bind(propertyKey)
      .all<FeedbackRow>(),
    db.prepare("SELECT * FROM ranking_adjustment_profile WHERE id='shared'").first<RankingRow>(),
    db
      .prepare("SELECT * FROM ranking_adjustment_audit ORDER BY created_at DESC,id DESC")
      .all<RankingAuditRow>(),
    db
      .prepare(
        `SELECT market_context,signal_combination_context,COUNT(*) judgment_count,COUNT(DISTINCT property_key) unique_property_count,
          SUM(CASE WHEN usefulness='useful' THEN 1 ELSE 0 END) useful_count,
          SUM(CASE WHEN usefulness='not_useful' THEN 1 ELSE 0 END) not_useful_count,
          SUM(CASE WHEN usefulness='unknown' THEN 1 ELSE 0 END) unknown_count,
          SUM(CASE WHEN outcome='offer_made' THEN 1 ELSE 0 END) offer_count,
          SUM(CASE WHEN outcome='closed' THEN 1 ELSE 0 END) closed_count,
          SUM(CASE WHEN research_minutes IS NOT NULL THEN research_minutes ELSE 0 END) research_minutes,
          SUM(CASE WHEN research_minutes IS NOT NULL THEN 1 ELSE 0 END) timed_count
        FROM property_feedback WHERE data_source='partner_review'
        GROUP BY market_context,signal_combination_context ORDER BY market_context,signal_combination_context`,
      )
      .all<PerformanceRow>(),
  ]);
  const rankingProfile = profile
    ? mapRankingProfile(profile)
    : {
        enabled: false,
        minimumSamples: 5,
        maximumAdjustment: 10,
        reason: "Baseline sorting; no feedback adjustment profile has been enabled.",
        version: 0,
        updatedAt: null,
        updatedBy: null,
      };
  const qualification = qualificationSummary(
    evidenceResult.results,
    enrichment,
    buyingFit,
    override,
    rechecks.results,
    now,
  );
  const groups = performanceRows.results.map((row) => {
    const labeled = Number(row.useful_count) + Number(row.not_useful_count);
    const uniqueProperties = Number(row.unique_property_count);
    const eligible = uniqueProperties >= rankingProfile.minimumSamples;
    const raw =
      labeled > 0
        ? ((Number(row.useful_count) - Number(row.not_useful_count)) / labeled) *
          rankingProfile.maximumAdjustment
        : 0;
    return {
      market: row.market_context,
      signalCombination: row.signal_combination_context,
      sampleCount: Number(row.judgment_count),
      labeledSampleCount: labeled,
      uniquePropertyCount: uniqueProperties,
      usefulCount: Number(row.useful_count),
      notUsefulCount: Number(row.not_useful_count),
      unknownCount: Number(row.unknown_count),
      offerCount: Number(row.offer_count),
      closedCount: Number(row.closed_count),
      timedReviewCount: Number(row.timed_count),
      researchMinutes: Number(row.research_minutes),
      adjustmentStatus: eligible ? ("eligible" as const) : ("insufficient_evidence" as const),
      priorityAdjustment: eligible
        ? Math.max(
            -rankingProfile.maximumAdjustment,
            Math.min(rankingProfile.maximumAdjustment, Math.round(raw)),
          )
        : 0,
      rationale: eligible
        ? `Bounded review-priority adjustment from ${labeled} current partner judgments across ${uniqueProperties} independently reviewed properties; not predictive confidence.`
        : `Insufficient evidence: ${labeled} labeled judgments across ${uniqueProperties} unique properties; ${rankingProfile.minimumSamples} unique properties required.`,
    };
  });
  return {
    qualification: {
      ...qualification,
      override: override ? mapOverride(override) : null,
      overrideHistory: overrideAudit.results.map((row) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        version: row.version,
        actorEmail: row.actor_email,
        createdAt: row.created_at,
      })),
    },
    assessments: assessments.results.map(mapAssessment),
    rechecks: rechecks.results.map(mapRecheck),
    latestVerifiedAt: rechecks.results[0]?.verified_at ?? null,
    feedback: feedback.results.map(mapFeedback),
    feedbackHistory: feedbackAudit.results.map(mapFeedback),
    performance: {
      judgmentCount: groups.reduce((sum, row) => sum + row.sampleCount, 0),
      uniquePropertyCount: new Set(
        (
          await db
            .prepare(
              "SELECT DISTINCT property_key FROM property_feedback WHERE data_source='partner_review'",
            )
            .all<{ property_key: string }>()
        ).results.map((row) => row.property_key),
      ).size,
      groups,
      dataBoundary:
        "Only current partner_review labels are included. Held-out benchmark reviews are stored separately and excluded.",
    },
    rankingProfile,
    rankingAudit: rankingAudit.results.map((row) => ({
      id: row.id,
      enabled: Boolean(row.enabled),
      minimumSamples: row.minimum_samples,
      maximumAdjustment: row.maximum_adjustment,
      reason: row.reason,
      version: row.version,
      actorEmail: row.actor_email,
      createdAt: row.created_at,
    })),
  };
}

function qualificationSummary(
  evidence: readonly EvidenceRow[],
  enrichment: EnrichmentRow | null,
  buyingFit: BuyingFitContext | null,
  override: OverrideRow | null,
  rechecks: readonly RecheckRow[],
  now: Date,
) {
  const current = evidence.filter((row) => row.snapshot_presence === "present");
  const latestRecheck = rechecks[0] ?? null;
  const findings = recheckFindings(latestRecheck);
  const effectiveState = (row: EvidenceRow) => {
    const source =
      row.source_id === "norfolk-delinquent-property-tax"
        ? findings?.sources.tax
        : row.source_id === "norfolk-code-violations"
          ? findings?.sources.code
          : null;
    if (source?.status === "success") {
      const checked = source.records.find(
        (record) => record.sourceRecordId === row.source_record_id,
      );
      return checked?.statusState ?? "unknown";
    }
    return evidenceStatusState(row);
  };
  const negative = current.filter((row) => effectiveState(row) === "resolved");
  const active = current.filter(
    (row) => row.signal_type !== "lien_release" && effectiveState(row) === "active",
  );
  const unknown = current.filter(
    (row) => row.signal_type !== "lien_release" && effectiveState(row) === "unknown",
  );
  const reasons: Array<{
    code: string;
    label: string;
    effect: "deprioritize" | "needs_research" | "supports_active";
    sourceRecordId?: string;
    sourceUrl?: string;
    sourceDate?: string;
  }> = [];
  for (const row of negative) {
    const link = evidenceLink(row);
    reasons.push({
      code: "explicit_resolution",
      label: `${row.signal_type.replaceAll("_", " ")} record ${row.source_record_id} is explicitly “${row.evidence_status}” as published; only this exact record is treated as negative.`,
      effect: "deprioritize",
      sourceRecordId: row.source_record_id,
      sourceUrl: link.sourceUrl,
      sourceDate:
        row.evidence_updated_at ?? row.event_date ?? row.source_updated_at ?? row.observed_at,
    });
  }
  for (const row of unknown.slice(0, 5)) {
    const link = evidenceLink(row);
    reasons.push({
      code: "unknown_source_status",
      label: `${row.source_name} status “${row.evidence_status ?? "not published"}” is not in that source's explicit active or resolved vocabulary; it remains unknown.`,
      effect: "needs_research",
      sourceRecordId: row.source_record_id,
      sourceUrl: link.sourceUrl,
      sourceDate:
        row.evidence_updated_at ?? row.event_date ?? row.source_updated_at ?? row.observed_at,
    });
  }
  for (const signal of new Set(active.map((row) => row.signal_type))) {
    const row = active.find((entry) => entry.signal_type === signal)!;
    const link = evidenceLink(row);
    reasons.push({
      code: "active_independent_signal",
      label: `${signal.replaceAll("_", " ")} remains an independent active-as-published signal; another signal's cure does not erase it.`,
      effect: "supports_active",
      sourceRecordId: row.source_record_id,
      sourceUrl: link.sourceUrl,
      sourceDate:
        row.evidence_updated_at ?? row.event_date ?? row.source_updated_at ?? row.observed_at,
    });
  }
  for (const row of current.filter((entry) => entry.signal_type === "lien_release")) {
    const link = evidenceLink(row);
    reasons.push({
      code: "instrument_specific_release",
      label: `Release record ${row.source_record_id} requires exact instrument linkage and does not release other parcel liens or independent taxes/code signals.`,
      effect: "needs_research",
      sourceRecordId: row.source_record_id,
      sourceUrl: link.sourceUrl,
      sourceDate:
        row.evidence_updated_at ?? row.event_date ?? row.source_updated_at ?? row.observed_at,
    });
  }
  const apns = new Set(
    current.map((row) => row.apn).filter((value): value is string => Boolean(value)),
  );
  if (
    current.some((row) => !row.apn) ||
    Array.from(apns).some((value) => !/^\d{8}$/.test(value) && value.length < 5)
  ) {
    reasons.push({
      code: "unmatched_identity",
      label:
        "One or more source records lack a qualified exact property identifier; no padding or fuzzy join is applied.",
      effect: "deprioritize",
    });
  }
  if (apns.size > 1) {
    reasons.push({
      code: "duplicate_identity",
      label:
        "Multiple raw property identifiers are grouped under this key and require identity review.",
      effect: "deprioritize",
    });
  }
  const newestSourceClock = current
    .map((row) => row.evidence_updated_at ?? row.source_updated_at ?? row.observed_at)
    .filter(Boolean)
    .toSorted()
    .at(-1);
  if (
    newestSourceClock &&
    now.getTime() - new Date(newestSourceClock).getTime() > 180 * 86_400_000
  ) {
    reasons.push({
      code: "stale_source",
      label: `Newest source clock ${newestSourceClock} is over 180 days old and requires a fresh check.`,
      effect: "deprioritize",
      sourceDate: newestSourceClock,
    });
  }
  const evidenceDates = current
    .map((row) => row.event_date)
    .filter((value): value is string => Boolean(value));
  const newestEvent = evidenceDates.toSorted().at(-1) ?? null;
  const ownerNames = new Set(
    [enrichment?.owner_name, ...current.map((row) => row.owner_name)]
      .filter((value): value is string => Boolean(value))
      .map(normalizeOwnerName),
  );
  if (
    ownerNames.size > 1 ||
    (enrichment?.last_transfer_date &&
      (!newestEvent || enrichment.last_transfer_date >= newestEvent))
  ) {
    const transferSourceUrl = enrichment?.assessment_source_url ?? enrichment?.owner_source_url;
    reasons.push({
      code: "owner_transfer_review",
      label: enrichment?.last_transfer_date
        ? `A transfer dated ${enrichment.last_transfer_date} or conservatively normalized owner-name conflict requires review; ownership change does not establish debt extinguishment.`
        : "Conservatively normalized owner names differ across sources and require identity review; formatting-only differences are ignored.",
      effect: "needs_research",
      ...(transferSourceUrl ? { sourceUrl: transferSourceUrl } : {}),
      ...(enrichment?.last_transfer_date ? { sourceDate: enrichment.last_transfer_date } : {}),
    });
  }
  if (buyingFit?.status === "no_match") {
    reasons.push({
      code: "buybox_mismatch",
      label: `Selected buy box does not match: ${buyingFit.reasons.join("; ")}`,
      effect: "deprioritize",
    });
  } else if (buyingFit?.status === "unknown") {
    reasons.push({
      code: "buybox_unknown",
      label: `Buy-box fit is unknown: ${buyingFit.missingInputs.join("; ") || "required facts are missing"}`,
      effect: "needs_research",
    });
  }
  const sourceBoundaries: string[] = [];
  const activeSources = new Set(active.map((row) => row.source_id));
  if (activeSources.has("norfolk-delinquent-property-tax")) {
    const tax = findings?.sources.tax;
    if (tax?.status !== "success" || tax.presence !== "present") {
      sourceBoundaries.push(
        tax?.status === "success"
          ? "The exact Norfolk tax query returned no matching rows; absence is not payoff evidence"
          : "The latest exact Norfolk tax lookup failed, drifted, or is unavailable",
      );
    }
  }
  if (activeSources.has("norfolk-code-violations")) {
    const code = findings?.sources.code;
    if (code?.status !== "success" || code.presence !== "present") {
      sourceBoundaries.push(
        code?.status === "success"
          ? "The exact Norfolk code query returned no matching rows; absence is not closure evidence"
          : "The latest exact Norfolk code lookup failed, drifted, or is unavailable",
      );
    }
  }
  if (
    active.some((row) =>
      [
        "recorded_lien",
        "notice_of_default",
        "mortgage_foreclosure_initiated",
        "scheduled_trustee_sale",
        "scheduled_tax_sale",
      ].includes(row.signal_type),
    )
  ) {
    sourceBoundaries.push(
      findings?.sources.legal.boundary ??
        "No supported exact-instrument legal status lookup is stored for the latest attempt",
    );
  }
  if (
    active.some(
      (row) =>
        !["norfolk-delinquent-property-tax", "norfolk-code-violations"].includes(row.source_id),
    )
  ) {
    sourceBoundaries.push(
      "One or more active source records have no supported source-specific selected-property recheck",
    );
  }
  if (sourceBoundaries.length > 0 || !latestRecheck) {
    reasons.push({
      code: "research_unknown",
      label: `${sourceBoundaries.join("; ") || "No selected-property recheck is stored"}. Assessor facts never verify tax, code, or legal status.`,
      effect: "needs_research",
    });
  }
  if (override?.action === "deprioritize") {
    reasons.push({
      code: "partner_override",
      label: `Partner override deprioritizes this lead: ${override.reason}`,
      effect: "deprioritize",
    });
  } else if (override?.action === "qualify") {
    reasons.push({
      code: "partner_override",
      label: `Partner override supports active review: ${override.reason}. Source facts remain unchanged.`,
      effect: "supports_active",
    });
  }
  const authoritativeMismatch = reasons.some((reason) =>
    ["buybox_mismatch", "unmatched_identity", "duplicate_identity"].includes(reason.code),
  );
  if (override?.action === "qualify" && authoritativeMismatch) {
    reasons.push({
      code: "partner_override_blocked",
      label:
        "The qualify override is retained but cannot supersede an exact-identity or selected buy-box mismatch. Resolve the blocking fact or reverse the override.",
      effect: "needs_research",
    });
  }
  const status: QualificationStatus =
    override?.action === "deprioritize" || authoritativeMismatch
      ? "deprioritized"
      : override?.action === "qualify" && !authoritativeMismatch
        ? "qualified"
        : active.length === 0 && unknown.length === 0
          ? "deprioritized"
          : reasons.some(
                (reason) =>
                  reason.effect === "needs_research" || reason.code === "explicit_resolution",
              )
            ? "needs_research"
            : "qualified";
  return { status, reasons };
}

async function insertRecheck(
  db: D1Database,
  row: {
    id: string;
    propertyKey: string;
    sourceId: string;
    status: string;
    attemptedAt: string;
    fetchedAt: string | null;
    datasetAsOf: string | null;
    verifiedAt: string | null;
    actorEmail: string;
    error: string | null;
    findings: RecheckFindings;
  },
) {
  await db
    .prepare(
      "INSERT INTO property_rechecks (id,property_key,source_id,status,attempted_at,fetched_at,dataset_as_of,verified_at,findings_json,actor_email,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      row.id,
      row.propertyKey,
      row.sourceId,
      row.status,
      row.attemptedAt,
      row.fetchedAt,
      row.datasetAsOf,
      row.verifiedAt,
      JSON.stringify(row.findings),
      row.actorEmail,
      row.error,
    )
    .run();
}

function validateFeedback(raw: FeedbackInput): FeedbackInput {
  if (!raw || typeof raw !== "object") {
    throw new DecisionValidationError("Feedback is invalid.");
  }
  if (!Number.isInteger(raw.expectedVersion) || raw.expectedVersion < 0) {
    throw new DecisionValidationError("Feedback version is invalid.");
  }
  if (!new Set(["useful", "not_useful", "unknown"]).has(raw.usefulness)) {
    throw new DecisionValidationError("Feedback usefulness is invalid.");
  }
  if (
    !new Set(["unresolved", "wrong_match", "stale", "resolved", "unknown"]).has(raw.verification)
  ) {
    throw new DecisionValidationError("Feedback verification is invalid.");
  }
  if (!new Set(["investigate", "not_interested", "unknown"]).has(raw.interest)) {
    throw new DecisionValidationError("Feedback interest is invalid.");
  }
  if (!new Set(["none", "offer_made", "closed", "unknown"]).has(raw.outcome)) {
    throw new DecisionValidationError("Feedback outcome is invalid.");
  }
  if (
    raw.researchMinutes !== null &&
    (!Number.isInteger(raw.researchMinutes) ||
      raw.researchMinutes < 0 ||
      raw.researchMinutes > 1_440)
  ) {
    throw new DecisionValidationError("Research minutes must be a whole number from 0 to 1440.");
  }
  return { ...raw, reason: validReason(raw.reason, "Feedback reason") };
}

async function propertyContext(db: D1Database, propertyKey: string) {
  const row = await db
    .prepare("SELECT jurisdiction_id,signal_types FROM watchlist_properties WHERE property_key=?")
    .bind(propertyKey)
    .first<{ jurisdiction_id: string; signal_types: string }>();
  if (row) {
    return { market: row.jurisdiction_id, signals: canonicalSignalCombination(row.signal_types) };
  }
  const fallback = await db
    .prepare(
      "SELECT MAX(jurisdiction_id) market,GROUP_CONCAT(DISTINCT signal_type) signals FROM foreclosure_records WHERE property_key=?",
    )
    .bind(propertyKey)
    .first<{ market: string; signals: string }>();
  return {
    market: fallback?.market ?? "unknown",
    signals: canonicalSignalCombination(fallback?.signals ?? "unknown"),
  };
}

function mapAssessment(row: AssessmentRow) {
  return {
    id: row.id,
    propertyKey: row.property_key,
    version: row.version,
    summary: row.summary,
    evidenceTotal: row.evidence_total,
    evidenceIncluded: row.evidence_included,
    evidenceOmitted: row.evidence_omitted,
    assertions: JSON.parse(row.assertions_json) as Array<Record<string, unknown>>,
    contradictions: JSON.parse(row.contradictions_json) as Array<Record<string, unknown>>,
    outstandingQuestions: JSON.parse(row.outstanding_questions_json) as string[],
    datasetAsOf: row.dataset_as_of,
    fetchedAt: row.fetched_at,
    reviewedAt: row.reviewed_at,
    verifiedAt: row.verified_at,
    createdBy: row.created_by,
  };
}

function mapOverride(row: OverrideRow) {
  return {
    propertyKey: row.property_key,
    action: row.action,
    reason: row.reason,
    version: row.version,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapFeedback(row: FeedbackRow) {
  return {
    propertyKey: row.property_key,
    reviewerEmail: row.reviewer_email,
    dataSource: row.data_source,
    usefulness: row.usefulness,
    verification: row.verification,
    interest: row.interest,
    outcome: row.outcome,
    researchMinutes: row.research_minutes,
    reason: row.reason,
    marketContext: row.market_context,
    signalCombinationContext: row.signal_combination_context,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecheck(row: RecheckRow) {
  return {
    id: row.id,
    propertyKey: row.property_key,
    sourceId: row.source_id,
    status: row.status,
    attemptedAt: row.attempted_at,
    fetchedAt: row.fetched_at,
    datasetAsOf: row.dataset_as_of,
    verifiedAt: row.verified_at,
    findings: recheckFindings(row),
    actorEmail: row.actor_email,
    error: row.error,
  };
}

function mapRankingProfile(row: RankingRow) {
  return {
    enabled: Boolean(row.enabled),
    minimumSamples: row.minimum_samples,
    maximumAdjustment: row.maximum_adjustment,
    reason: row.reason,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function partnerEmail(value: string) {
  const email = typeof value === "string" ? canonicalPartnerEmail(value) : null;
  if (!email) {
    throw new DecisionValidationError("Actor is not an authorized partner identity.");
  }
  return email;
}

function validatePropertyKey(value: string) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9-]+:[^\s]{1,260}$/i.test(value) ||
    value.length > 300
  ) {
    throw new DecisionValidationError("Invalid property key.");
  }
}

async function assertKnownProperty(db: D1Database, propertyKey: string) {
  const known = await db
    .prepare("SELECT 1 present FROM foreclosure_records WHERE property_key=? LIMIT 1")
    .bind(propertyKey)
    .first();
  if (!known) {
    throw new DecisionValidationError("Property key is not present in retained evidence.");
  }
}

function validReason(value: string, label: string) {
  if (typeof value !== "string") {
    throw new DecisionValidationError(`${label} must be text.`);
  }
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 1_000) {
    throw new DecisionValidationError(`${label} must be 3 to 1000 characters.`);
  }
  return reason;
}

function safeError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Public source request failed.";
  return message.replace(/https?:\/\/\S+/g, "public source").slice(0, 500);
}

type AssessmentRow = {
  id: string;
  property_key: string;
  version: number;
  summary: string;
  evidence_total: number;
  evidence_included: number;
  evidence_omitted: number;
  assertions_json: string;
  contradictions_json: string;
  outstanding_questions_json: string;
  dataset_as_of: string | null;
  fetched_at: string | null;
  reviewed_at: string;
  verified_at: string | null;
  created_by: string;
};
type RecheckRow = {
  id: string;
  property_key: string;
  source_id: string;
  status: string;
  attempted_at: string;
  fetched_at: string | null;
  dataset_as_of: string | null;
  verified_at: string | null;
  findings_json: string;
  actor_email: string;
  error: string | null;
};

type RecheckFindings = {
  version: 1;
  parcelId: string;
  attemptedAt: string;
  sources: {
    tax: RecheckSourceFinding;
    code: RecheckSourceFinding;
    assessor: RecheckSourceFinding;
    legal: RecheckSourceFinding;
  };
};

function recheckFindings(row: RecheckRow | null): RecheckFindings | null {
  if (!row?.findings_json) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.findings_json) as RecheckFindings;
    return parsed?.version === 1 && parsed.sources ? parsed : null;
  } catch {
    return null;
  }
}

function failedSourceFinding(
  sourceId: string,
  sourceName: string,
  error: string,
): RecheckSourceFinding {
  return {
    sourceId,
    sourceName,
    status: "failed",
    presence: "unknown",
    fetchedAt: null,
    publicationAsOf: null,
    sourceAsOf: null,
    metadataUrl: null,
    queryUrl: null,
    recordCount: 0,
    records: [],
    boundary: "The latest lookup failed or drifted; no verification clock was advanced.",
    error,
  };
}

function verificationForEvidence(row: EvidenceRow, latestRecheck: RecheckRow | null): string {
  const findings = recheckFindings(latestRecheck);
  const source =
    row.source_id === "norfolk-delinquent-property-tax"
      ? findings?.sources.tax
      : row.source_id === "norfolk-code-violations"
        ? findings?.sources.code
        : null;
  if (!source || source.status !== "success") {
    return "Publisher record only; the latest applicable exact-source lookup is unavailable, failed, or unsupported.";
  }
  const match = source.records.find((record) => record.sourceRecordId === row.source_record_id);
  if (match) {
    return `Exact source record found in the bounded lookup fetched ${match.fetchedAt}; this is publication evidence, not independent current-payoff verification.`;
  }
  return `No exact matching row was returned by the bounded lookup fetched ${source.fetchedAt}; absence does not establish paid, cured, resolved, or closed status.`;
}
type PerformanceRow = {
  market_context: string;
  signal_combination_context: string;
  judgment_count: number;
  unique_property_count: number;
  useful_count: number;
  not_useful_count: number;
  unknown_count: number;
  offer_count: number;
  closed_count: number;
  research_minutes: number;
  timed_count: number;
};
type RankingAuditRow = {
  id: string;
  enabled: number;
  minimum_samples: number;
  maximum_adjustment: number;
  reason: string;
  version: number;
  actor_email: string;
  created_at: string;
};
