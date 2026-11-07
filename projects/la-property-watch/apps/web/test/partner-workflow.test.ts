import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ResearchRecord } from "../src/lib/model.ts";
import {
  addPropertyNote,
  addValueAssumption,
  evaluateBuyingFit,
  loadDealBrief,
  loadPartnerWorkspace,
  markAlertsRead,
  PartnerConflictError,
  selectedEvidenceCsv,
  updateAlertPreferences,
  updatePipelineProperty,
  upsertBuyBox,
} from "../src/lib/partner.server.ts";
import { loadDashboard, requestRefreshJob, runRefreshJob } from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const actor = "ericventor97@gmail.com";
const partner = "Rhwcreative@gmail.com";
const sourceUrl = "https://data.norfolk.gov/resource/test.json";

function evidence(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  const observedAt = overrides.observedAt ?? "2026-11-07T12:00:00.000Z";
  return {
    id: "norfolk-tax:15834200:2025:1",
    saleType: "tax_default",
    signalType: "tax_delinquency",
    jurisdictionId: "norfolk-va",
    jurisdictionName: "Norfolk, VA",
    sourceRecordId: "15834200:2025:1",
    sourceKey: "15834200:2025:1",
    sourceId: "norfolk-test",
    sourceName: "City of Norfolk · Test publication",
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
    eventDate: "2026-11-06",
    scheduledDate: null,
    scheduledTime: null,
    status: "signal_status_unverified",
    apn: "15834200",
    propertyKey: "norfolk-va:15834200",
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
    ownerName: "OWNER FROM TAX ROLL",
    propertyType: "REAL ESTATE",
    taxYear: 2025,
    taxInstallment: 1,
    taxDueCents: 100_000,
    penaltyDueCents: 0,
    interestDueCents: 0,
    evidenceStatus: "Delinquent as published",
    evidenceDetail: null,
    evidenceUpdatedAt: null,
    priority: 1,
    rawExcerpt: "test-only official-source-shaped fixture",
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

async function publish(
  database: ReturnType<typeof testDatabase>,
  records: readonly ResearchRecord[],
  options: {
    complete?: boolean;
    updated?: string;
    published?: string;
    failPublishBatch?: boolean;
  } = {},
) {
  const when = options.updated ?? records[0]?.observedAt ?? "2026-11-07T12:00:00.000Z";
  const job = await requestRefreshJob(database.binding, "manual", new Date(when));
  if (options.failPublishBatch) {
    database.failNextBatchAfterStatement?.(2);
  }
  return runRefreshJob(database.binding, job.job.id, "manual", [
    {
      id: "norfolk-test",
      name: "City of Norfolk · Test publication",
      url: sourceUrl,
      load: async () => ({
        sourceId: "norfolk-test",
        sourceName: "City of Norfolk · Test publication",
        sourceUrl,
        sourceUpdatedAt: options.published ?? when,
        snapshotComplete: options.complete ?? true,
        warnings: [],
        records,
      }),
    },
  ]);
}

describe("partner workflow", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
  });
  afterEach(() => database.close());

  it("establishes an honest first-publication baseline and emits deterministic later changes", async () => {
    const first = evidence();
    await publish(database, [first]);
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM property_change_events").get()?.["n"],
      0,
    );
    const baseline = database.sqlite
      .prepare("SELECT baseline_established_at FROM source_publications WHERE source_id=?")
      .get(first.sourceId);
    assert.equal(typeof baseline?.["baseline_established_at"], "string");

    const secondAt = "2026-11-08T12:00:00.000Z";
    const installment = evidence({
      id: "norfolk-tax:15834200:2025:2",
      sourceRecordId: "15834200:2025:2",
      sourceKey: "15834200:2025:2",
      taxInstallment: 2,
      delinquentAmountCents: 75_000,
      taxDueCents: 75_000,
      observedAt: secondAt,
      lastSeenAt: secondAt,
      updatedAt: secondAt,
    });
    await publish(
      database,
      [
        evidence({
          delinquentAmountCents: 140_000,
          taxDueCents: 140_000,
          observedAt: secondAt,
          lastSeenAt: secondAt,
          updatedAt: secondAt,
        }),
        installment,
      ],
      { updated: secondAt },
    );
    const types = database.sqlite
      .prepare("SELECT event_type FROM property_change_events ORDER BY event_type")
      .all()
      .map((row) => row["event_type"]);
    assert.deepEqual(types, ["balance_changed", "new_delinquent_installment"]);
    await publish(
      database,
      [evidence({ delinquentAmountCents: 140_000, taxDueCents: 140_000 }), installment],
      {
        updated: "2026-11-09T12:00:00.000Z",
      },
    );
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM property_change_events").get()?.["n"],
      2,
      "replaying an already observed state must not duplicate an event",
    );
  });

  it("distinguishes missing, explicit status, reappearance, independent signal, and foreclosure events", async () => {
    const first = evidence();
    await publish(database, [first]);
    await publish(database, [], { updated: "2026-11-08T12:00:00.000Z", complete: false });
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM property_change_events").get()?.["n"],
      0,
    );
    await publish(database, [], { updated: "2026-11-09T12:00:00.000Z", complete: true });
    const missing = database.sqlite
      .prepare("SELECT event_type,after_json FROM property_change_events")
      .get();
    assert.equal(missing?.["event_type"], "missing_from_snapshot");
    assert.match(String(missing?.["after_json"]), /needs_verification/);
    assert.doesNotMatch(String(missing?.["after_json"]), /cured|paid/i);

    await publish(database, [first], { updated: "2026-11-10T12:00:00.000Z" });
    const code = evidence({
      id: "norfolk-code:V-1",
      sourceRecordId: "V-1",
      sourceKey: "V-1",
      signalType: "code_violation",
      delinquentAmountCents: null,
      taxDueCents: null,
      taxYear: null,
      taxInstallment: null,
      evidenceStatus: "Open",
    });
    const foreclosure = evidence({
      id: "norfolk-foreclosure:F-1",
      sourceRecordId: "F-1",
      sourceKey: "F-1",
      signalType: "mortgage_foreclosure_initiated",
      delinquentAmountCents: null,
      taxDueCents: null,
      taxYear: null,
      taxInstallment: null,
      evidenceStatus: "Filed",
    });
    await publish(database, [first, code, foreclosure], {
      updated: "2026-11-11T12:00:00.000Z",
    });
    const allTypes = database.sqlite
      .prepare("SELECT event_type FROM property_change_events")
      .all()
      .map((row) => row["event_type"]);
    assert.ok(allTypes.includes("evidence_reappeared"));
    assert.ok(allTypes.includes("new_independent_signal"));
    assert.ok(allTypes.includes("foreclosure_initiated"));

    await publish(
      database,
      [first, code, { ...foreclosure, evidenceStatus: "Withdrawn (Cured)" }],
      { updated: "2026-11-12T12:00:00.000Z" },
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_change_events WHERE event_type='explicit_status_changed'",
        )
        .get()?.["n"],
      1,
    );
  });

  it("keeps evidence/events/ranking atomic when a later publish statement fails", async () => {
    await publish(database, [evidence()]);
    const changed = evidence({ delinquentAmountCents: 500_000, taxDueCents: 500_000 });
    await publish(database, [changed], {
      updated: "2026-11-08T12:00:00.000Z",
      failPublishBatch: true,
    });
    assert.equal(
      database.sqlite.prepare("SELECT delinquent_amount_cents v FROM foreclosure_records").get()?.[
        "v"
      ],
      100_000,
    );
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM property_change_events").get()?.["n"],
      0,
    );
  });

  it("keeps unknown fit unknown and explains confidence independently of distress", async () => {
    const noFacts = evaluateBuyingFit(
      {
        propertyKey: "norfolk-va:15834200",
        jurisdictionId: "norfolk-va",
        zip: null,
        normalizedPropertyType: null,
        lotAreaSqft: null,
        assessedValueCents: null,
        signalTypes: ["tax_delinquency"],
      },
      {
        propertyTypes: ["sfh"],
        jurisdictions: ["norfolk-va"],
        neighborhoods: [],
        zips: ["23509"],
        sizeBasis: "lot_square_feet",
        minSizeValue: 800,
        maxSizeValue: 3_000,
        minValueCents: 10_000_000,
        maxValueCents: 50_000_000,
        valueBasis: "assessed_value",
        valueAssumptionLabel: null,
        distressPhases: ["early_distress"],
      },
    );
    assert.equal(noFacts.status, "unknown");
    assert.ok(noFacts.missingInputs.some((reason) => /not published|not available/i.test(reason)));
    assert.notEqual(noFacts.status, "match");
  });

  it("persists shared buy boxes and pipeline state with optimistic concurrency and append-only notes", async () => {
    await publish(database, [evidence()]);
    const buyBox = await upsertBuyBox(database.binding, actor, {
      id: null,
      expectedVersion: 0,
      name: "Norfolk small residential",
      propertyTypes: ["sfh", "small_multifamily"],
      jurisdictions: ["norfolk-va"],
      neighborhoods: ["Ballentine Place"],
      zips: ["23509"],
      sizeBasis: "lot_square_feet",
      minSizeValue: 800,
      maxSizeValue: 5_000,
      minValueCents: 10_000_000,
      maxValueCents: 60_000_000,
      valueBasis: "assessed_value",
      valueAssumptionLabel: null,
      distressPhases: ["early_distress", "filed_foreclosure"],
    });
    assert.equal(buyBox.version, 1);

    const propertyKey = "norfolk-va:15834200";
    const state = await updatePipelineProperty(database.binding, actor, propertyKey, 0, {
      saved: true,
      dismissed: false,
      stage: "Researching",
      assignedTo: partner,
      followUpAt: "2026-11-10T15:00:00.000Z",
      passReason: null,
    });
    assert.equal(state.version, 1);
    await assert.rejects(
      updatePipelineProperty(database.binding, partner, propertyKey, 0, { stage: "Qualified" }),
      PartnerConflictError,
    );
    await Promise.all([
      addPropertyNote(database.binding, actor, propertyKey, "Tax total needs reconfirmation."),
      addPropertyNote(database.binding, partner, propertyKey, "Reviewing official parcel detail."),
    ]);
    const workspace = await loadPartnerWorkspace(database.binding, partner);
    assert.equal(workspace.buyBoxes[0]?.name, buyBox.name);
    assert.equal(workspace.pipeline[0]?.stage, "Researching");
    const brief = await loadDealBrief(database.binding, propertyKey, buyBox.id);
    if (!brief) {
      throw new Error("Expected retained deal brief.");
    }
    assert.deepEqual(
      brief.notes.map((note) => note.authorEmail).toSorted(),
      [actor, partner].toSorted(),
    );

    await publish(database, [], { updated: "2026-11-12T12:00:00.000Z", complete: true });
    const retained = await loadPartnerWorkspace(database.binding, actor);
    assert.equal(retained.pipeline[0]?.propertyKey, propertyKey);
    assert.equal(retained.pipeline[0]?.stage, "Researching");
  });

  it("creates persistent saved-property alerts with personal read/preferences state", async () => {
    await publish(database, [evidence()]);
    await updatePipelineProperty(database.binding, actor, "norfolk-va:15834200", 0, {
      saved: true,
    });
    await updateAlertPreferences(database.binding, actor, {
      newActivity: true,
      worseningActivity: false,
      dueFollowUps: true,
    });
    await publish(database, [evidence({ delinquentAmountCents: 125_000, taxDueCents: 125_000 })], {
      updated: "2026-11-08T12:00:00.000Z",
    });
    const ownerWorkspace = await loadPartnerWorkspace(database.binding, actor);
    const partnerWorkspace = await loadPartnerWorkspace(database.binding, partner);
    assert.equal(ownerWorkspace.alerts.length, 0, "disabled worsening alerts stay disabled");
    assert.equal(partnerWorkspace.alerts.length, 1, "preferences remain personal");
  });

  it("exports exactly selected keys from one coherent snapshot and neutralizes formulas", async () => {
    await publish(database, [evidence({ ownerName: '=HYPERLINK("bad")' })]);
    const second = evidence({
      id: "norfolk-tax:00000218:2025:1",
      sourceRecordId: "00000218:2025:1",
      sourceKey: "00000218:2025:1",
      apn: "00000218",
      propertyKey: "norfolk-va:00000218",
      address: "+CMD",
    });
    await publish(database, [evidence({ ownerName: '=HYPERLINK("bad")' }), second], {
      updated: "2026-11-08T12:00:00.000Z",
    });
    const csv = await selectedEvidenceCsv(database.binding, ["norfolk-va:15834200"]);
    assert.match(csv, /norfolk-va:15834200/);
    assert.doesNotMatch(csv, /norfolk-va:00000218/);
    assert.doesNotMatch(csv, /,"[=+\-@]/);
    assert.equal(csv.trim().split("\n").length, 2);
  });

  it("canonicalizes partner identity and reads generated plus 200-ID alert batches within D1 limits", async () => {
    await publish(database, [evidence()]);
    await updatePipelineProperty(
      database.binding,
      "rhwcreative@gmail.com",
      "norfolk-va:15834200",
      0,
      { saved: true, followUpAt: "2026-11-07T10:00:00.000Z" },
      new Date("2026-11-06T10:00:00.000Z"),
    );
    await publish(database, [evidence({ delinquentAmountCents: 140_000, taxDueCents: 140_000 })], {
      updated: "2026-11-08T12:00:00.000Z",
    });
    const workspace = await loadPartnerWorkspace(
      database.binding,
      "rhwcreative@gmail.com",
      new Date("2026-11-09T00:00:00.000Z"),
    );
    assert.equal(workspace.alerts.length, 2);
    assert.ok(workspace.alerts.some((alert) => alert.kind === "due_follow_up"));
    assert.ok(workspace.alerts.some((alert) => alert.kind === "worsening_activity"));
    await markAlertsRead(
      database.binding,
      "RHWCREATIVE@GMAIL.COM",
      workspace.alerts.map((alert) => alert.id),
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_alerts WHERE user_email=? AND read_at IS NOT NULL",
        )
        .get(partner)?.["n"],
      2,
    );

    const ids = Array.from({ length: 200 }, (_, index) => `manual@alert:${index}`);
    const insert = database.sqlite.prepare(
      "INSERT INTO property_alerts (id,user_email,property_key,kind,title,created_at,available_at) VALUES (?,?,?,'new_activity','Manual regression row',?,?)",
    );
    for (const id of ids) {
      insert.run(
        id,
        partner,
        "norfolk-va:15834200",
        "2026-11-09T00:00:00.000Z",
        "2026-11-09T00:00:00.000Z",
      );
    }
    database.sqlite
      .prepare(
        "INSERT INTO property_alerts (id,user_email,property_key,kind,title,created_at,available_at) VALUES (?,?,?,'new_activity','Other recipient',?,?)",
      )
      .run(
        "other-user-alert",
        actor,
        "norfolk-va:15834200",
        "2026-11-09T00:00:00.000Z",
        "2026-11-09T00:00:00.000Z",
      );
    await markAlertsRead(database.binding, "rhwcreative@gmail.com", ids);
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_alerts WHERE id LIKE 'manual@alert:%' AND read_at IS NOT NULL",
        )
        .get()?.["n"],
      200,
    );
    assert.equal(
      database.sqlite
        .prepare("SELECT read_at FROM property_alerts WHERE id='other-user-alert'")
        .get()?.["read_at"],
      null,
    );
  });

  it("makes first-create conflicts and follow-up alert writes atomic", async () => {
    await publish(database, [evidence()]);
    database.failNextBatchAfterStatement(1);
    await assert.rejects(
      updatePipelineProperty(database.binding, actor, "norfolk-va:15834200", 0, {
        saved: true,
        followUpAt: "2026-11-08T00:00:00.000Z",
      }),
      /Injected transactional batch failure/,
    );
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM partner_properties").get()?.["n"],
      0,
    );
    assert.equal(database.sqlite.prepare("SELECT count(*) n FROM property_alerts").get()?.["n"], 0);

    const outcomes = await Promise.allSettled([
      updatePipelineProperty(database.binding, actor, "norfolk-va:15834200", 0, { saved: true }),
      updatePipelineProperty(database.binding, partner, "norfolk-va:15834200", 0, {
        stage: "Researching",
      }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = outcomes.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.ok(rejection?.reason instanceof PartnerConflictError);
    assert.equal(
      database.sqlite.prepare("SELECT count(*) n FROM partner_properties").get()?.["n"],
      1,
    );
  });

  it("suppresses obsolete follow-up alerts after reschedule, clear, pass, or preference disable", async () => {
    await publish(database, [evidence()]);
    let state = await updatePipelineProperty(
      database.binding,
      actor,
      "norfolk-va:15834200",
      0,
      {
        saved: true,
        followUpAt: "2026-11-08T00:00:00.000Z",
      },
      new Date("2026-11-07T00:00:00.000Z"),
    );
    assert.equal(
      (await loadPartnerWorkspace(database.binding, actor, new Date("2026-11-09T00:00:00.000Z")))
        .alerts.length,
      1,
    );
    state = await updatePipelineProperty(
      database.binding,
      actor,
      state.propertyKey,
      state.version,
      { followUpAt: "2026-12-01T00:00:00.000Z" },
      new Date("2026-11-09T01:00:00.000Z"),
    );
    assert.equal(
      (await loadPartnerWorkspace(database.binding, actor, new Date("2026-11-09T02:00:00.000Z")))
        .alerts.length,
      0,
    );
    state = await updatePipelineProperty(
      database.binding,
      actor,
      state.propertyKey,
      state.version,
      { followUpAt: null },
    );
    assert.equal(
      database.sqlite
        .prepare("SELECT count(*) n FROM property_alerts WHERE kind='due_follow_up'")
        .get()?.["n"],
      0,
    );
    state = await updatePipelineProperty(
      database.binding,
      actor,
      state.propertyKey,
      state.version,
      { followUpAt: "2026-11-08T00:00:00.000Z" },
    );
    state = await updatePipelineProperty(
      database.binding,
      actor,
      state.propertyKey,
      state.version,
      { stage: "Passed", passReason: "Not in current acquisition area" },
    );
    assert.equal(state.followUpAt, null);
    assert.equal(
      (await loadPartnerWorkspace(database.binding, actor, new Date("2026-11-09T00:00:00.000Z")))
        .alerts.length,
      0,
    );
    state = await updatePipelineProperty(
      database.binding,
      actor,
      state.propertyKey,
      state.version,
      { stage: "Researching", followUpAt: "2026-11-08T00:00:00.000Z" },
    );
    await updateAlertPreferences(database.binding, actor, {
      newActivity: true,
      worseningActivity: true,
      dueFollowUps: false,
    });
    assert.equal(
      (await loadPartnerWorkspace(database.binding, actor, new Date("2026-11-09T00:00:00.000Z")))
        .alerts.length,
      0,
    );
  });

  it("uses explicit status vocabularies, one independent-signal event, and repeatable real change cycles", async () => {
    await publish(database, [evidence({ evidenceStatus: "Unpaid" })]);
    await publish(database, [evidence({ evidenceStatus: "Still Unpaid" })], {
      updated: "2026-11-08T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_change_events WHERE event_type='explicit_status_changed'",
        )
        .get()?.["n"],
      0,
    );
    const codeRows = [1, 2].map((number) =>
      evidence({
        id: `norfolk-code:V-${number}`,
        sourceRecordId: `V-${number}`,
        sourceKey: `V-${number}`,
        signalType: "code_violation",
        delinquentAmountCents: null,
        taxDueCents: null,
        taxYear: null,
        taxInstallment: null,
        evidenceStatus: "Open",
      }),
    );
    await publish(database, [evidence({ evidenceStatus: "Unpaid" }), ...codeRows], {
      updated: "2026-11-09T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_change_events WHERE event_type='new_independent_signal'",
        )
        .get()?.["n"],
      1,
    );
    await publish(
      database,
      [evidence({ delinquentAmountCents: 140_000, taxDueCents: 140_000 }), ...codeRows],
      { updated: "2026-11-10T00:00:00.000Z", published: "2026-11-06T12:00:00.000Z" },
    );
    await publish(
      database,
      [evidence({ delinquentAmountCents: 100_000, taxDueCents: 100_000 }), ...codeRows],
      { updated: "2026-11-11T00:00:00.000Z", published: "2026-11-06T12:00:00.000Z" },
    );
    await publish(
      database,
      [evidence({ delinquentAmountCents: 100_000, taxDueCents: 100_000 }), ...codeRows],
      { updated: "2026-11-12T00:00:00.000Z", published: "2026-11-06T12:00:00.000Z" },
    );
    assert.equal(
      database.sqlite
        .prepare("SELECT count(*) n FROM property_change_events WHERE event_type='balance_changed'")
        .get()?.["n"],
      2,
    );
    await publish(database, [], {
      updated: "2026-11-13T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    await publish(database, [evidence(), ...codeRows], {
      updated: "2026-11-14T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    await publish(database, [], {
      updated: "2026-11-15T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    await publish(database, [evidence(), ...codeRows], {
      updated: "2026-11-16T00:00:00.000Z",
      published: "2026-11-06T12:00:00.000Z",
    });
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_change_events WHERE event_type='missing_from_snapshot'",
        )
        .get()?.["n"],
      6,
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT count(*) n FROM property_change_events WHERE event_type='evidence_reappeared'",
        )
        .get()?.["n"],
      6,
    );
  });

  it("keeps distress strength equal across dollar size, repeated rows, and publication freshness", async () => {
    const rows = [
      evidence({
        propertyKey: "norfolk-va:10000001",
        apn: "10000001",
        id: "a",
        sourceRecordId: "a",
        sourceKey: "a",
        delinquentAmountCents: 100,
        taxDueCents: 100,
        sourceUpdatedAt: "2026-11-07T00:00:00.000Z",
      }),
      evidence({
        propertyKey: "norfolk-va:10000002",
        apn: "10000002",
        id: "b1",
        sourceRecordId: "b1",
        sourceKey: "b1",
        delinquentAmountCents: 99_000_000,
        taxDueCents: 99_000_000,
        sourceUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
      evidence({
        propertyKey: "norfolk-va:10000002",
        apn: "10000002",
        id: "b2",
        sourceRecordId: "b2",
        sourceKey: "b2",
        taxInstallment: 2,
        delinquentAmountCents: 50_000_000,
        taxDueCents: 50_000_000,
        sourceUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
    ];
    await publish(database, rows);
    const dashboard = await loadDashboard(database.binding);
    assert.deepEqual(
      dashboard.properties.map((property) => property.score),
      [40, 40],
    );
    assert.ok(
      dashboard.properties.every((property) =>
        property.scoreReasons.some((reason) => /do not increase distress strength/.test(reason)),
      ),
    );
  });

  it("exports 100 exact keys, rejects missing keys, detects publication changes, and types arrears versus principal", async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => {
      const parcel = String(20_000_000 + index);
      return evidence({
        propertyKey: `norfolk-va:${parcel}`,
        apn: parcel,
        id: `row-${parcel}`,
        sourceRecordId: parcel,
        sourceKey: parcel,
        ...(index === 0
          ? {
              saleType: "trustee" as const,
              signalType: "mortgage_foreclosure_initiated" as const,
              delinquentAmountCents: null,
              taxDueCents: null,
              principalBalanceCents: 12_345_678,
              principalAsOfDate: "2026-11-01",
            }
          : {}),
      });
    });
    await publish(database, hundred);
    const csv = await selectedEvidenceCsv(
      database.binding,
      hundred.map((row) => row.propertyKey),
    );
    assert.equal(csv.trim().split("\n").length, 101);
    assert.match(
      csv.split("\n")[0] ?? "",
      /delinquent_or_arrears_cents.*unpaid_balance_cents.*principal_balance_cents.*reported_amount_basis/,
    );
    assert.match(
      csv,
      /"row-20000000","mortgage_foreclosure_initiated","present",,,12345678,"principal_balance",12345678,/,
    );
    assert.match(
      csv,
      /"row-20000001","tax_delinquency","present",100000,,,"delinquent_or_arrears",100000,/,
    );
    const first = hundred[0];
    assert.ok(first);
    await assert.rejects(
      selectedEvidenceCsv(database.binding, [first.propertyKey, "norfolk-va:99999999"]),
      /not found/i,
    );

    const many = Array.from({ length: 1_001 }, (_, index) =>
      evidence({
        id: `many-${String(index).padStart(4, "0")}`,
        sourceRecordId: `many-${index}`,
        sourceKey: `many-${index}`,
        taxInstallment: index + 1,
      }),
    );
    await publish(database, many, { updated: "2026-11-08T00:00:00.000Z" });
    database.afterNextAll(/ORDER BY id LIMIT 1000/, () => {
      database.sqlite
        .prepare(
          "UPDATE source_publications SET last_success_run_id='mutated-mid-export',updated_at='2026-11-08T00:00:01.000Z' WHERE source_id='norfolk-test'",
        )
        .run();
    });
    await assert.rejects(
      selectedEvidenceCsv(database.binding, ["norfolk-va:15834200"]),
      /changed during export/i,
    );
  });

  it("uses D1-safe boundary buy boxes and the same named assumption on dashboard and brief", async () => {
    await publish(database, [evidence()]);
    database.sqlite
      .prepare(
        "INSERT INTO property_enrichment (property_key,jurisdiction_id,parcel_id,source_parcel_id,join_method,building_area_unit_status,lot_area_sqft,observed_at,raw_json) VALUES (?,?,?,?,?,'unverified',?,?,?)",
      )
      .run(
        "norfolk-va:15834200",
        "norfolk-va",
        "15834200",
        "15834200",
        "exact_literal_pin",
        2_000,
        "2026-11-07T00:00:00.000Z",
        "{}",
      );
    await addValueAssumption(
      database.binding,
      actor,
      "norfolk-va:15834200",
      { label: "Partner offer basis", valueCents: 20_000_000, asOfDate: "2026-11-01" },
      new Date("2026-11-01T00:00:00.000Z"),
    );
    await addValueAssumption(
      database.binding,
      actor,
      "norfolk-va:15834200",
      { label: "Unrelated newer estimate", valueCents: 90_000_000, asOfDate: "2026-11-07" },
      new Date("2026-11-07T00:00:00.000Z"),
    );
    const zips = ["23509", ...Array.from({ length: 99 }, (_, index) => String(10_000 + index))];
    const buyBox = await upsertBuyBox(database.binding, actor, {
      id: null,
      expectedVersion: 0,
      name: "Named assumption boundary",
      propertyTypes: [],
      jurisdictions: [],
      neighborhoods: [],
      zips,
      sizeBasis: "lot_square_feet",
      minSizeValue: 1_000,
      maxSizeValue: 3_000,
      minValueCents: 15_000_000,
      maxValueCents: 25_000_000,
      valueBasis: "user_assumption",
      valueAssumptionLabel: "Partner offer basis",
      distressPhases: ["early_distress"],
    });
    const dashboard = await loadDashboard(database.binding, {
      buyBoxId: buyBox.id,
      fit: "match",
      sort: "fit",
    });
    assert.equal(dashboard.page.total, 1);
    assert.equal(dashboard.properties[0]?.userAssumptionCents, 20_000_000);
    const brief = await loadDealBrief(database.binding, "norfolk-va:15834200", buyBox.id);
    assert.equal(brief?.buyingFit.status, "match");
  });

  it("rejects ghost notes and assumptions while retaining research after sourced evidence disappears", async () => {
    await assert.rejects(
      addPropertyNote(database.binding, actor, "norfolk-va:99999999", "ghost"),
      /retained evidence/i,
    );
    await assert.rejects(
      addValueAssumption(database.binding, actor, "norfolk-va:99999999", {
        label: "ghost",
        valueCents: 1,
        asOfDate: "2026-11-01",
      }),
      /retained evidence/i,
    );
    await publish(database, [evidence()]);
    await addPropertyNote(database.binding, actor, "norfolk-va:15834200", "Retain this note");
    await addValueAssumption(database.binding, actor, "norfolk-va:15834200", {
      label: "Retain this assumption",
      valueCents: 1_000,
      asOfDate: "2026-11-01",
    });
    await publish(database, [], { updated: "2026-11-08T00:00:00.000Z" });
    const brief = await loadDealBrief(database.binding, "norfolk-va:15834200");
    assert.equal(brief?.notes.length, 1);
    assert.equal(brief?.assumptions.length, 1);
  });

  it("publishes explicit activity, alert, and deal-evidence pagination totals", async () => {
    const records = Array.from({ length: 501 }, (_, index) =>
      evidence({
        id: `paged-${String(index).padStart(3, "0")}`,
        sourceRecordId: `paged-${index}`,
        sourceKey: `paged-${index}`,
        taxInstallment: index + 1,
      }),
    );
    await publish(database, records);
    await updatePipelineProperty(database.binding, actor, "norfolk-va:15834200", 0, {
      saved: true,
    });
    const insertChange = database.sqlite.prepare(
      "INSERT INTO property_change_events (id,property_key,source_id,event_type,severity,detected_at,after_json,source_name,source_url,ingestion_run_id) VALUES (?,?,?,'balance_changed','changed',?,'{}','Test source',?,'manual')",
    );
    const insertAlert = database.sqlite.prepare(
      "INSERT INTO property_alerts (id,user_email,property_key,change_event_id,kind,title,created_at,available_at) VALUES (?,?,?,?, 'new_activity','Test alert',?,?)",
    );
    for (let index = 0; index < 201; index += 1) {
      const id = `page-${String(index).padStart(3, "0")}`;
      const when = `2026-11-07T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`;
      insertChange.run(id, "norfolk-va:15834200", "manual", when, sourceUrl);
      insertAlert.run(`alert-${id}`, actor, "norfolk-va:15834200", id, when, when);
    }
    const first = await loadPartnerWorkspace(
      database.binding,
      actor,
      new Date("2026-11-08T00:00:00.000Z"),
    );
    assert.deepEqual(first.activityPage, { page: 1, pageSize: 200, total: 201, totalPages: 2 });
    assert.deepEqual(first.alertPage, { page: 1, pageSize: 200, total: 201, totalPages: 2 });
    const second = await loadPartnerWorkspace(
      database.binding,
      actor,
      new Date("2026-11-08T00:00:00.000Z"),
      { activityPage: 2, alertPage: 2 },
    );
    assert.equal(second.activity.length, 1);
    assert.equal(second.alerts.length, 1);
    const brief = await loadDealBrief(database.binding, "norfolk-va:15834200", null, 1, 200);
    assert.equal(brief?.evidence.length, 200);
    assert.equal(brief?.evidenceTotal, 501);
    assert.equal(brief?.evidencePage.totalPages, 3);
    assert.equal(brief?.evidenceTruncated, true);
  });
});
