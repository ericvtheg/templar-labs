import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createPropertyAssessment,
  loadDecisionSupport,
  recheckSelectedProperty,
  updateQualificationOverride,
  updateRankingProfile,
  upsertPropertyFeedback,
} from "../src/lib/decision-support.server.ts";
import { evidenceStatusState } from "../src/lib/evidence-semantics.ts";
import type { ResearchRecord } from "../src/lib/model.ts";
import { addPropertyNote, loadDealBrief, upsertBuyBox } from "../src/lib/partner.server.ts";
import { loadDashboard, requestRefreshJob, runRefreshJob } from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const actor = "ericventor97@gmail.com";
const partner = "Rhwcreative@gmail.com";
const propertyKey = "norfolk-va:15834200";
const sourceUrl = "https://data.norfolk.gov/resource/test.json";

function evidence(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  const observedAt = overrides.observedAt ?? "2026-11-07T12:00:00.000Z";
  return {
    id: "tax-1",
    saleType: "tax_default",
    signalType: "tax_delinquency",
    jurisdictionId: "norfolk-va",
    jurisdictionName: "Norfolk, VA",
    sourceRecordId: "tax-1",
    sourceKey: "tax-1",
    sourceId: "norfolk-test",
    sourceName: "City of Norfolk test publication",
    sourceUrl,
    sourceDocumentUrl: null,
    sourcePublishedAt: "2026-11-06T12:00:00.000Z",
    sourceAsOfDate: "2026-11-06",
    sourceUpdatedAt: "2026-11-06T12:00:00.000Z",
    sourceGoodThrough: null,
    sourceKind: "current",
    snapshotPresence: "present",
    noLongerPresentAt: null,
    observedAt,
    eventDate: "2026-10-31",
    scheduledDate: null,
    scheduledTime: null,
    status: "signal_status_unverified",
    apn: "15834200",
    propertyKey,
    address: "2800 VIMY RIDGE AV",
    city: "Norfolk",
    state: "VA",
    zip: "23509",
    assessorAddress: null,
    assessorCity: null,
    assessorState: null,
    assessorZip: null,
    assessorObservedAt: null,
    assessorSourceUrl: null,
    itemNumber: null,
    minimumBidCents: null,
    delinquentAmountCents: 100_000,
    unpaidBalanceCents: null,
    principalBalanceCents: null,
    principalAsOfDate: null,
    trusteeSaleNumber: null,
    trusteeName: null,
    saleVerificationPhone: null,
    salePlace: null,
    legalDescription: null,
    ownerName: "TAX OWNER",
    propertyType: "REAL ESTATE",
    taxYear: 2025,
    taxInstallment: 1,
    taxDueCents: 100_000,
    penaltyDueCents: 0,
    interestDueCents: 0,
    evidenceStatus: "Cured as published",
    evidenceDetail: null,
    evidenceUpdatedAt: "2026-11-06T12:00:00.000Z",
    priority: 1,
    rawExcerpt: "source-shaped test fixture",
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

async function publish(database: ReturnType<typeof testDatabase>, records: ResearchRecord[]) {
  const now = new Date(
    records.some((record) => record.propertyKey !== propertyKey)
      ? "2026-11-07T12:01:00.000Z"
      : "2026-11-07T12:00:00.000Z",
  );
  const job = await requestRefreshJob(database.binding, "manual", now);
  await runRefreshJob(database.binding, job.job.id, "manual", [
    {
      id: "norfolk-test",
      name: "City of Norfolk test publication",
      url: sourceUrl,
      load: async () => ({
        sourceId: "norfolk-test",
        sourceName: "City of Norfolk test publication",
        sourceUrl,
        sourceUpdatedAt: "2026-11-06T12:00:00.000Z",
        snapshotComplete: true,
        warnings: [],
        records,
      }),
    },
  ]);
}

describe("partner decision support", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(async () => {
    database = testDatabase();
    await publish(database, [
      evidence(),
      evidence({
        id: "code-1",
        sourceRecordId: "code-1",
        sourceKey: "code-1",
        signalType: "code_violation",
        evidenceStatus: "Open",
        delinquentAmountCents: null,
        taxDueCents: null,
        taxYear: null,
        taxInstallment: null,
        ownerName: "CODE OWNER",
      }),
      evidence({
        id: "lien-1",
        sourceRecordId: "lien-1",
        sourceKey: "lien-1",
        signalType: "recorded_lien",
        evidenceStatus: "Recorded",
        delinquentAmountCents: null,
        taxDueCents: null,
        taxYear: null,
        taxInstallment: null,
      }),
      evidence({
        id: "release-1",
        sourceRecordId: "release-1",
        sourceKey: "release-1",
        signalType: "lien_release",
        evidenceStatus: "Release recorded for instrument 44",
        delinquentAmountCents: null,
        taxDueCents: null,
        taxYear: null,
        taxInstallment: null,
      }),
    ]);
  });
  afterEach(() => database.close());

  it("uses explicit source vocabularies and never resolves negated or unknown status text", () => {
    const cases = [
      ["norfolk-delinquent-property-tax", "tax_delinquency", "Unpaid", "active"],
      ["norfolk-delinquent-property-tax", "tax_delinquency", "Paid", "resolved"],
      ["norfolk-code-violations", "code_violation", "Work in Progress", "active"],
      ["norfolk-code-violations", "code_violation", "Closed - Corrected", "resolved"],
      ["norfolk-delinquent-property-tax", "tax_delinquency", "Not paid", "unknown"],
      ["norfolk-code-violations", "code_violation", "Unresolved", "unknown"],
      ["norfolk-code-violations", "code_violation", "Not closed", "unknown"],
      ["unknown-source", "tax_delinquency", "Paid", "unknown"],
    ] as const;
    for (const [sourceId, signalType, status, expected] of cases) {
      assert.equal(
        evidenceStatusState({
          source_id: sourceId,
          signal_type: signalType,
          evidence_status: status,
        }),
        expected,
        `${sourceId}/${signalType}/${status}`,
      );
    }
  });

  it("keeps dashboard filters and detail qualification identical for status, fit, ownership, recency, and overrides", async () => {
    database.sqlite
      .prepare(
        "UPDATE foreclosure_records SET evidence_status=CASE signal_type WHEN 'tax_delinquency' THEN 'Unpaid' WHEN 'code_violation' THEN 'Unresolved' WHEN 'recorded_lien' THEN 'Not closed' ELSE evidence_status END,snapshot_presence=CASE WHEN signal_type='lien_release' THEN 'no_longer_present' ELSE snapshot_presence END",
      )
      .run();
    const unknownStatus = await loadDecisionSupport(
      database.binding,
      propertyKey,
      null,
      new Date("2026-11-07T15:00:00.000Z"),
    );
    assert.equal(unknownStatus.qualification.status, "needs_research");
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "needs_research" })).page.total,
      1,
    );

    const noMatch = await upsertBuyBox(database.binding, actor, {
      id: null,
      expectedVersion: 0,
      name: "Different market",
      propertyTypes: [],
      jurisdictions: ["denver-co"],
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
    const mismatchBrief = await loadDealBrief(database.binding, propertyKey, noMatch.id);
    assert.equal(mismatchBrief?.decisionSupport.qualification.status, "deprioritized");
    assert.equal(
      (
        await loadDashboard(database.binding, {
          buyBoxId: noMatch.id,
          qualification: "deprioritized",
        })
      ).page.total,
      1,
    );

    database.sqlite
      .prepare(
        "INSERT INTO property_enrichment (property_key,jurisdiction_id,parcel_id,source_parcel_id,join_method,owner_name,owner_source_url,owner_observed_at,building_area_unit_status,last_transfer_date,assessment_source_url,source_updated_at,observed_at,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        propertyKey,
        "norfolk-va",
        "15834200",
        "15834200",
        "exact_literal_pin",
        "TAX OWNER",
        "https://data.norfolk.gov/resource/qva7-tzrf.json?parcel_id=15834200",
        "2026-11-07T12:00:00.000Z",
        "unverified",
        "2026-11-01",
        "https://data.norfolk.gov/resource/qva7-tzrf.json?parcel_id=15834200",
        "2026-11-07T00:00:00.000Z",
        "2026-11-07T12:00:00.000Z",
        "{}",
      );
    const ownershipBrief = await loadDealBrief(database.binding, propertyKey);
    assert.equal(ownershipBrief?.decisionSupport.qualification.status, "needs_research");
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "needs_research" })).page.total,
      1,
    );

    const override = await updateQualificationOverride(database.binding, actor, propertyKey, {
      expectedVersion: 0,
      action: "qualify",
      reason: "Partner accepts the documented research boundary",
    });
    assert.equal(override.action, "qualify");
    const overridden = await loadDealBrief(database.binding, propertyKey);
    assert.equal(overridden?.decisionSupport.qualification.status, "qualified");
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "qualified" })).page.total,
      1,
    );
  });

  it("persists a concise attributed assessment without parcel-wide release or unsupported claims", async () => {
    const assessment = await createPropertyAssessment(
      database.binding,
      actor,
      propertyKey,
      new Date("2026-11-07T15:00:00.000Z"),
    );
    assert.ok(assessment.assertions.length >= 4);
    assert.ok(
      assessment.assertions.every(
        (entry) => entry.sourceUrl && entry.sourceName && entry.fetchedAt && entry.recordDate,
      ),
    );
    assert.match(JSON.stringify(assessment), /Cured as published/);
    assert.match(JSON.stringify(assessment), /recorded_lien/);
    assert.match(JSON.stringify(assessment.contradictions), /owner|release|independent/i);
    assert.doesNotMatch(JSON.stringify(assessment), /motivat|will foreclose|likely to/i);
    const loaded = await loadDecisionSupport(database.binding, propertyKey, null);
    assert.equal(loaded.assessments[0]?.id, assessment.id);
    assert.equal(loaded.assessments[0]?.reviewedAt, "2026-11-07T15:00:00.000Z");
  });

  it("keeps sourced negatives independent, makes unknowns explicit, and audits reversible overrides", async () => {
    await addPropertyNote(
      database.binding,
      actor,
      propertyKey,
      "Retain through qualification edits",
    );
    let support = await loadDecisionSupport(
      database.binding,
      propertyKey,
      null,
      new Date("2026-11-07T15:00:00.000Z"),
    );
    assert.equal(support.qualification.status, "needs_research");
    assert.ok(
      support.qualification.reasons.some((reason) => reason.code === "explicit_resolution"),
    );
    assert.ok(
      support.qualification.reasons.some(
        (reason) =>
          reason.code === "active_independent_signal" && /code|recorded lien/i.test(reason.label),
      ),
    );
    assert.ok(
      support.qualification.reasons.some(
        (reason) =>
          reason.code === "instrument_specific_release" && /does not release/i.test(reason.label),
      ),
    );
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "needs_research" })).page.total,
      1,
    );

    const override = await updateQualificationOverride(
      database.binding,
      actor,
      propertyKey,
      { expectedVersion: 0, action: "deprioritize", reason: "Partner verified a bad lead" },
      new Date("2026-11-07T16:00:00.000Z"),
    );
    assert.equal(override.version, 1);
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "deprioritized" })).page.total,
      1,
    );
    await assert.rejects(
      updateQualificationOverride(database.binding, partner, propertyKey, {
        expectedVersion: 0,
        action: "qualify",
        reason: "stale concurrent choice",
      }),
      /reload|changed/i,
    );
    await updateQualificationOverride(
      database.binding,
      partner,
      propertyKey,
      { expectedVersion: 1, action: "source_only", reason: "Return to sourced status" },
      new Date("2026-11-07T17:00:00.000Z"),
    );
    support = await loadDecisionSupport(database.binding, propertyKey, null);
    assert.equal(support.qualification.override?.action, "source_only");
    assert.equal(support.qualification.overrideHistory.length, 2);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM foreclosure_records").get()?.["n"],
      4,
    );
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) n FROM property_notes").get()?.["n"], 1);
  });

  it("stores source-scoped clocks only after stable tax/code fetches and records later failures", async () => {
    const target = {
      parcel_id: "15834200",
      property_class_description: "510 S/F Detached",
      property_use: "Single Family - Detached",
      effective_year: "2026-07-01T00:00:00.000",
      transfer_date: "1998-03-04T00:00:00.000",
      consideration: "100000",
    };
    const metadata = {
      id: "qva7-tzrf",
      rowsUpdatedAt: 1_794_053_270,
      viewLastModified: 1_794_054_056,
    };
    const taxMetadata = {
      id: "7qie-z5gv",
      rowsUpdatedAt: 1_794_056_113,
      viewLastModified: 1_794_056_098,
      columns: ["taxdue", "penaltydue", "interestdue", "total"].map((fieldName) => ({
        fieldName,
        format: { precisionStyle: "currency", precision: "2" },
      })),
    };
    const codeMetadata = {
      id: "agip-sqwc",
      rowsUpdatedAt: 1_794_053_773,
      viewLastModified: 1_794_053_800,
    };
    const requests: string[] = [];
    const successfulFetch = async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      const parsed = new URL(url);
      if (url.includes("/api/views/7qie-z5gv")) {
        return new Response(JSON.stringify(taxMetadata));
      }
      if (url.includes("/api/views/agip-sqwc")) {
        return new Response(JSON.stringify(codeMetadata));
      }
      if (url.includes("/api/views/")) {
        return new Response(JSON.stringify(metadata));
      }
      if (url.includes("/resource/7qie-z5gv.json")) {
        return new Response(
          JSON.stringify([
            {
              biitem: "15834200",
              bwtaxyear: "2025",
              bwtaxinstallment: "4",
              owner_name: "TAX OWNER",
              address: "2800 VIMY RIDGE AV",
              taxdue: "1000.00",
              penaltydue: "100.00",
              interestdue: "10.00",
              total: "1110.00",
              account: "630504",
            },
          ]),
        );
      }
      if (url.includes("/resource/agip-sqwc.json")) {
        return new Response(
          JSON.stringify([
            {
              violation_id: "code-1",
              tax_account: "15834200",
              created_date: "2026-10-31T00:00:00.000",
              last_modified_date: "2026-11-06T00:00:00.000",
              status: "Work in Progress",
            },
          ]),
        );
      }
      if (parsed.searchParams.get("parcel_id") === "15834200") {
        return new Response(JSON.stringify([target]));
      }
      if (parsed.searchParams.has("$select")) {
        return new Response("[]");
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const success = await recheckSelectedProperty(
      database.binding,
      actor,
      propertyKey,
      successfulFetch as typeof fetch,
      new Date("2026-11-07T18:00:00.000Z"),
    );
    assert.equal(success.status, "success");
    assert.equal(success.fetchedAt, "2026-11-07T18:00:00.000Z");
    assert.equal(success.verifiedAt, null);
    assert.equal(success.findings.sources.tax.status, "success");
    assert.equal(success.findings.sources.code.status, "success");
    assert.ok(requests.some((url) => url.includes("round%28total%2C2%29+as+total")));
    database.sqlite
      .prepare(
        `UPDATE foreclosure_records SET
          source_id=CASE signal_type WHEN 'tax_delinquency' THEN 'norfolk-delinquent-property-tax' WHEN 'code_violation' THEN 'norfolk-code-violations' ELSE source_id END,
          source_record_id=CASE signal_type WHEN 'tax_delinquency' THEN '15834200:630504:2025:4' WHEN 'code_violation' THEN 'code-1' ELSE source_record_id END,
          evidence_status=CASE signal_type WHEN 'tax_delinquency' THEN 'Reported at least one quarter behind' WHEN 'code_violation' THEN 'Work in Progress' ELSE evidence_status END,
          owner_name='SAME OWNER',
          snapshot_presence=CASE WHEN signal_type IN ('recorded_lien','lien_release') THEN 'no_longer_present' ELSE snapshot_presence END`,
      )
      .run();
    assert.equal(
      (await loadDecisionSupport(database.binding, propertyKey, null)).qualification.status,
      "qualified",
    );
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "qualified" })).page.total,
      1,
    );
    const failure = await recheckSelectedProperty(
      database.binding,
      actor,
      propertyKey,
      (async () => new Response("blocked", { status: 503 })) as typeof fetch,
      new Date("2026-11-07T19:00:00.000Z"),
    );
    assert.equal(failure.status, "failed");
    assert.equal(failure.verifiedAt, null);
    const loaded = await loadDecisionSupport(database.binding, propertyKey, null);
    assert.equal(loaded.latestVerifiedAt, null);
    assert.equal(loaded.rechecks[0]?.status, "failed");
    assert.equal(loaded.qualification.status, "needs_research");
  });

  it("uses only the latest source-scoped recheck and never lets assessor success verify tax, code, or legal facts", async () => {
    database.sqlite
      .prepare(
        "UPDATE foreclosure_records SET evidence_status=CASE signal_type WHEN 'tax_delinquency' THEN 'Unpaid' WHEN 'code_violation' THEN 'Work in Progress' WHEN 'recorded_lien' THEN 'Recorded' ELSE evidence_status END,snapshot_presence=CASE WHEN signal_type='lien_release' THEN 'no_longer_present' ELSE snapshot_presence END",
      )
      .run();
    database.sqlite
      .prepare(
        "INSERT INTO property_rechecks (id,property_key,source_id,status,attempted_at,fetched_at,dataset_as_of,verified_at,actor_email,error) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "assessor-success",
        propertyKey,
        "norfolk-fy27-assessor",
        "success",
        "2026-11-07T18:00:00.000Z",
        "2026-11-07T18:00:00.000Z",
        "2026-11-07T00:00:00.000Z",
        "2026-11-07T18:00:00.000Z",
        actor,
        null,
      );
    database.sqlite
      .prepare(
        "INSERT INTO property_rechecks (id,property_key,source_id,status,attempted_at,fetched_at,dataset_as_of,verified_at,actor_email,error) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "later-failure",
        propertyKey,
        "norfolk-official-selected-property",
        "failed",
        "2026-11-07T19:00:00.000Z",
        null,
        null,
        null,
        actor,
        "source drift",
      );
    const support = await loadDecisionSupport(database.binding, propertyKey, null);
    assert.equal(support.latestVerifiedAt, null);
    assert.equal(support.qualification.status, "needs_research");
    assert.ok(support.qualification.reasons.some((reason) => reason.code === "research_unknown"));
    assert.equal(
      (await loadDashboard(database.binding, { qualification: "needs_research" })).page.total,
      1,
    );
  });

  it("preserves the full assessment ledger, exact record links, and normalized owner comparison", async () => {
    const columns = database.sqlite
      .prepare("PRAGMA table_info(foreclosure_records)")
      .all()
      .map((row) => String(row["name"]));
    const quoted = columns.map((column) => `"${column}"`).join(",");
    const projection = columns
      .map((column) =>
        ["id", "source_record_id", "source_key"].includes(column) ? "?" : `"${column}"`,
      )
      .join(",");
    const clone = database.sqlite.prepare(
      `INSERT INTO foreclosure_records (${quoted}) SELECT ${projection} FROM foreclosure_records WHERE id='tax-1'`,
    );
    for (let index = 0; index < 9; index += 1) {
      clone.run(`ledger-${index}`, `ledger-${index}`, `ledger-${index}`);
    }
    database.sqlite
      .prepare("UPDATE foreclosure_records SET owner_name='SMITH LLC' WHERE property_key=?")
      .run(propertyKey);
    database.sqlite
      .prepare(
        "UPDATE foreclosure_records SET source_id='norfolk-delinquent-property-tax',source_name='City of Norfolk · Delinquent Property Taxes',source_url='https://data.norfolk.gov/api/views/7qie-z5gv/rows.csv?accessType=DOWNLOAD',source_document_url='https://data.norfolk.gov/api/views/7qie-z5gv' WHERE property_key=? AND signal_type='tax_delinquency'",
      )
      .run(propertyKey);
    database.sqlite
      .prepare(
        "INSERT INTO property_enrichment (property_key,jurisdiction_id,parcel_id,source_parcel_id,join_method,owner_name,owner_source_url,owner_observed_at,building_area_unit_status,observed_at,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        propertyKey,
        "norfolk-va",
        "15834200",
        "15834200",
        "exact_literal_pin",
        "Smith, L.L.C.",
        "https://data.norfolk.gov/resource/qva7-tzrf.json?parcel_id=15834200",
        "2026-11-07T12:00:00.000Z",
        "unverified",
        "2026-11-07T12:00:00.000Z",
        "{}",
      );
    const assessment = await createPropertyAssessment(database.binding, actor, propertyKey);
    assert.equal(assessment.evidenceTotal, 13);
    assert.equal(assessment.evidenceIncluded, 13);
    assert.equal(assessment.evidenceOmitted, 0);
    assert.equal(
      assessment.contradictions.some((entry) => entry.code === "owner_names_differ"),
      false,
    );
    const taxAssertion = assessment.assertions.find(
      (entry) => entry.sourceId === "norfolk-delinquent-property-tax",
    );
    assert.equal(taxAssertion?.sourceLinkKind, "exact_record");
    assert.match(taxAssertion?.sourceUrl ?? "", /resource\/7qie-z5gv\.json/);
  });

  it("never creates phantom audits for rejected same-actor stale mutations", async () => {
    const sameTime = new Date("2026-11-07T20:00:00.000Z");
    const overrideResults = await Promise.allSettled([
      updateQualificationOverride(
        database.binding,
        actor,
        propertyKey,
        { expectedVersion: 0, action: "qualify", reason: "First concurrent override" },
        sameTime,
      ),
      updateQualificationOverride(
        database.binding,
        actor,
        propertyKey,
        { expectedVersion: 0, action: "deprioritize", reason: "Rejected concurrent override" },
        sameTime,
      ),
    ]);
    assert.equal(overrideResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      database.sqlite
        .prepare("SELECT COUNT(*) n FROM property_qualification_override_audit")
        .get()?.["n"],
      1,
    );

    const feedbackInput = {
      expectedVersion: 0,
      usefulness: "useful" as const,
      verification: "unresolved" as const,
      interest: "investigate" as const,
      outcome: "none" as const,
      researchMinutes: 10,
      reason: "Concurrent real partner judgment",
    };
    const feedbackResults = await Promise.allSettled([
      upsertPropertyFeedback(database.binding, actor, propertyKey, feedbackInput, sameTime),
      upsertPropertyFeedback(
        database.binding,
        actor,
        propertyKey,
        { ...feedbackInput, usefulness: "not_useful", reason: "Rejected stale judgment" },
        sameTime,
      ),
    ]);
    assert.equal(feedbackResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM property_feedback_audit").get()?.["n"],
      1,
    );

    const profileResults = await Promise.allSettled([
      updateRankingProfile(
        database.binding,
        actor,
        {
          expectedVersion: 0,
          enabled: true,
          minimumSamples: 5,
          maximumAdjustment: 10,
          reason: "First concurrent profile",
        },
        sameTime,
      ),
      updateRankingProfile(
        database.binding,
        actor,
        {
          expectedVersion: 0,
          enabled: false,
          minimumSamples: 6,
          maximumAdjustment: 8,
          reason: "Rejected concurrent profile",
        },
        sameTime,
      ),
    ]);
    assert.equal(profileResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM ranking_adjustment_audit").get()?.["n"],
      1,
    );
  });

  it("deduplicates current reviewer labels, preserves review-time context, and excludes held-out rows", async () => {
    const first = await upsertPropertyFeedback(
      database.binding,
      actor,
      propertyKey,
      {
        expectedVersion: 0,
        usefulness: "useful",
        verification: "unresolved",
        interest: "investigate",
        outcome: "none",
        researchMinutes: 18,
        reason: "Independent tax and code signals warranted review",
      },
      new Date("2026-11-07T20:00:00.000Z"),
    );
    assert.equal(first.version, 1);
    database.sqlite
      .prepare(
        "UPDATE watchlist_properties SET signal_types='tax_delinquency' WHERE property_key=?",
      )
      .run(propertyKey);
    const revised = await upsertPropertyFeedback(
      database.binding,
      actor,
      propertyKey,
      {
        expectedVersion: 1,
        usefulness: "not_useful",
        verification: "stale",
        interest: "not_interested",
        outcome: "none",
        researchMinutes: 25,
        reason: "Revision after current evidence review",
      },
      new Date("2026-11-07T21:00:00.000Z"),
    );
    assert.equal(revised.version, 2);
    await upsertPropertyFeedback(database.binding, partner, propertyKey, {
      expectedVersion: 0,
      usefulness: "useful",
      verification: "unresolved",
      interest: "investigate",
      outcome: "offer_made",
      researchMinutes: 12,
      reason: "Second independent partner judgment",
    });
    database.sqlite
      .prepare(
        "INSERT INTO property_feedback (property_key,reviewer_email,data_source,usefulness,verification,interest,outcome,research_minutes,reason,market_context,signal_combination_context,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        propertyKey,
        "benchmark-reviewer@example.test",
        "held_out_benchmark",
        "useful",
        "unresolved",
        "investigate",
        "closed",
        1,
        "must not feed partner performance",
        "norfolk-va",
        "tax_delinquency",
        1,
        "2026-11-07T22:00:00.000Z",
        "2026-11-07T22:00:00.000Z",
      );
    const support = await loadDecisionSupport(database.binding, propertyKey, null);
    assert.equal(support.performance.judgmentCount, 2);
    assert.equal(support.performance.uniquePropertyCount, 1);
    assert.equal(support.feedbackHistory.filter((row) => row.reviewerEmail === actor).length, 2);
    const actorHistory = support.feedbackHistory.filter((row) => row.reviewerEmail === actor);
    assert.notEqual(
      actorHistory[0]?.signalCombinationContext,
      actorHistory.at(-1)?.signalCombinationContext,
    );
    assert.equal(support.performance.groups[0]?.adjustmentStatus, "insufficient_evidence");
  });

  it("requires minimum evidence for bounded adjustments and keeps toggle/reset audit", async () => {
    const insert = database.sqlite.prepare(
      "INSERT INTO property_feedback (property_key,reviewer_email,data_source,usefulness,verification,interest,outcome,research_minutes,reason,market_context,signal_combination_context,version,created_at,updated_at) VALUES (?,?,'partner_review','useful','unresolved','investigate','none',10,'Real partner review label','norfolk-va','tax_delinquency',1,?,?)",
    );
    for (let index = 0; index < 3; index += 1) {
      const parcel = String(20_000_000 + index);
      const key = `norfolk-va:${parcel}`;
      insert.run(
        key,
        index === 1 ? partner : actor,
        `2026-11-07T2${index}:00:00.000Z`,
        `2026-11-07T2${index}:00:00.000Z`,
      );
    }
    const enabled = await updateRankingProfile(database.binding, actor, {
      expectedVersion: 0,
      enabled: true,
      minimumSamples: 3,
      maximumAdjustment: 10,
      reason: "Enable only after the explicit evidence threshold",
    });
    assert.equal(enabled.enabled, true);
    database.sqlite
      .prepare(
        "UPDATE watchlist_properties SET signal_types='tax_delinquency',score=40 WHERE property_key=?",
      )
      .run(propertyKey);
    const adjusted = await loadDashboard(database.binding, { sort: "adjusted" });
    assert.equal(adjusted.properties[0]?.priorityAdjustment, 10);
    assert.equal(adjusted.properties[0]?.adjustedPriorityScore, 50);
    const support = await loadDecisionSupport(database.binding, propertyKey, null);
    const eligible = support.performance.groups.find((group) => group.sampleCount >= 3);
    assert.equal(eligible?.adjustmentStatus, "eligible");
    assert.ok(Math.abs(eligible?.priorityAdjustment ?? 99) <= 10);
    const reset = await updateRankingProfile(database.binding, partner, {
      expectedVersion: enabled.version,
      enabled: false,
      minimumSamples: 3,
      maximumAdjustment: 10,
      reason: "Reset to baseline sorting",
    });
    assert.equal(reset.enabled, false);
    assert.equal(reset.version, 2);
    assert.equal(
      (await loadDecisionSupport(database.binding, propertyKey, null)).rankingAudit.length,
      2,
    );
  });

  it("requires five independently reviewed properties rather than six judgments on three properties", async () => {
    const insert = database.sqlite.prepare(
      "INSERT INTO property_feedback (property_key,reviewer_email,data_source,usefulness,verification,interest,outcome,research_minutes,reason,market_context,signal_combination_context,version,created_at,updated_at) VALUES (?,?,'partner_review','useful','unresolved','investigate','none',10,'Real review','norfolk-va','tax_delinquency',1,?,?)",
    );
    for (let index = 0; index < 3; index += 1) {
      const key = index === 0 ? propertyKey : `norfolk-va:${String(30_000_000 + index)}`;
      for (const reviewer of [actor, partner]) {
        insert.run(
          key,
          reviewer,
          `2026-11-07T2${index}:00:00.000Z`,
          `2026-11-07T2${index}:00:00.000Z`,
        );
      }
    }
    await updateRankingProfile(database.binding, actor, {
      expectedVersion: 0,
      enabled: true,
      minimumSamples: 5,
      maximumAdjustment: 10,
      reason: "Require five distinct reviewed properties",
    });
    database.sqlite
      .prepare(
        "UPDATE watchlist_properties SET signal_types='tax_delinquency',score=40 WHERE property_key=?",
      )
      .run(propertyKey);
    const dashboard = await loadDashboard(database.binding, { sort: "adjusted" });
    assert.equal(dashboard.properties[0]?.priorityAdjustment, 0);
    const group = (
      await loadDecisionSupport(database.binding, propertyKey, null)
    ).performance.groups.find((entry) => entry.signalCombination === "tax_delinquency");
    assert.equal(group?.sampleCount, 6);
    assert.equal(group?.uniquePropertyCount, 3);
    assert.equal(group?.adjustmentStatus, "insufficient_evidence");
  });
});
