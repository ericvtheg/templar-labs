import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createBlindBenchmark,
  listBlindBenchmarks,
  loadBlindBenchmark,
  loadPropertyScenarios,
  revealBlindBenchmark,
  revealedBenchmarkCsv,
  ScenarioBenchmarkConflictError,
  ScenarioBenchmarkValidationError,
  upsertBlindReview,
  upsertPropertyScenario,
} from "../src/lib/scenario-benchmark.server.ts";
import { testDatabase } from "./support/d1.ts";

const actor = "ericventor97@gmail.com";
const partner = "Rhwcreative@gmail.com";
const key = "norfolk-va:15834200";
const otherKey = "norfolk-va:00000218";
const asOf = "2026-11-07";
const cell = (value: number | null) => ({ value, asOf: value === null ? null : asOf });
const datedCell = (value: number | null, date: string) => ({
  value,
  asOf: value === null ? null : date,
});

function flipInputs() {
  return {
    purchasePrice: cell(200_000),
    acquisitionFixed: cell(2_000),
    acquisitionRate: cell(0.02),
    rehab: cell(30_000),
    contingencyRate: cell(0.1),
    holdingMonths: cell(6),
    holdingMonthly: cell(1_000),
    loanToPurchase: cell(0.8),
    annualInterestRate: cell(0.12),
    originationRate: cell(0.02),
    financingFixed: cell(500),
    salePrice: cell(300_000),
    sellingRate: cell(0.06),
    sellingFixed: cell(1_000),
    targetProfit: cell(25_000),
  };
}

function rentalInputs(financing: "cash" | "amortizing") {
  const financed = financing === "amortizing";
  return {
    purchasePrice: cell(200_000),
    acquisitionFixed: cell(2_000),
    acquisitionRate: cell(0.02),
    rehab: cell(30_000),
    contingencyRate: cell(0.1),
    stabilizationMonths: cell(2),
    stabilizationMonthly: cell(1_000),
    loanToPurchase: cell(financed ? 0.8 : 0),
    annualInterestRate: cell(financed ? 0.06 : 0),
    originationRate: cell(financed ? 0.02 : 0),
    financingFixed: cell(financed ? 500 : 0),
    loanTermMonths: cell(financed ? 360 : 0),
    elapsedLoanMonths: cell(12),
    monthlyRent: cell(2_500),
    otherMonthlyIncome: cell(100),
    vacancyRate: cell(0.05),
    monthlyTaxes: cell(300),
    monthlyInsurance: cell(100),
    monthlyHoa: cell(0),
    otherMonthlyOperating: cell(50),
    maintenanceRate: cell(0.05),
    managementRate: cell(0.08),
    monthlyCapex: cell(150),
    targetAllInYield: cell(0.08),
  };
}

function seed(database: ReturnType<typeof testDatabase>) {
  const insertWatchlist = database.sqlite.prepare(`INSERT INTO watchlist_properties
    (property_key,jurisdiction_id,jurisdiction_name,parcel_id,address,city,state,zip,owner_name,property_type,score,signal_types,independent_signal_count,evidence_count,tax_installment_count,code_violation_count,recorded_lien_count,total_delinquent_cents,earliest_tax_year,freshest_source_updated_at,first_seen_at,last_seen_at,source_names,ranked_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertWatchlist.run(
    key,
    "norfolk-va",
    "Norfolk, VA",
    "15834200",
    "2800 VIMY RIDGE AV",
    "Norfolk",
    "VA",
    "23509",
    null,
    null,
    65,
    '["tax_delinquency"]',
    1,
    1,
    1,
    0,
    0,
    100_000,
    2025,
    "2026-11-06T00:00:00.000Z",
    "2026-11-01T00:00:00.000Z",
    "2026-11-07T00:00:00.000Z",
    '["Norfolk"]',
    "2026-11-07T00:00:00.000Z",
  );
  insertWatchlist.run(
    otherKey,
    "norfolk-va",
    "Norfolk, VA",
    "00000218",
    "218 TEST ST",
    "Norfolk",
    "VA",
    "23510",
    null,
    null,
    25,
    '["code_violation"]',
    1,
    1,
    0,
    1,
    0,
    0,
    null,
    "2026-11-06T00:00:00.000Z",
    "2026-11-01T00:00:00.000Z",
    "2026-11-07T00:00:00.000Z",
    '["Norfolk"]',
    "2026-11-07T00:00:00.000Z",
  );
  database.sqlite
    .prepare(`INSERT INTO property_sales
    (id,subject_property_key,candidate_parcel_id,candidate_property_key,identity_status,candidate_address,sale_date,sale_price_cents,document_number,normalized_property_type,building_area_source_value,building_area_unit_status,document_parcel_count,qualification_status,exclusion_reason,selection_reason,source_url,source_updated_at,observed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      "sale-real-1",
      key,
      "12345678",
      "norfolk-va:12345678",
      "exact_literal_pin",
      "123 SOURCE ST",
      "2026-01-02",
      25_000_000,
      "DOC-1",
      "sfh",
      1200,
      "unverified",
      1,
      "candidate",
      null,
      "Same published property class and bounded transfer date",
      "https://data.norfolk.gov/resource/qva7-tzrf.json",
      "2026-11-06T00:00:00.000Z",
      "2026-11-07T00:00:00.000Z",
    );
  database.sqlite
    .prepare(`INSERT INTO property_sales
    (id,subject_property_key,candidate_parcel_id,identity_status,sale_date,sale_price_cents,building_area_unit_status,qualification_status,selection_reason,source_url,observed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      "sale-other",
      otherKey,
      "87654321",
      "exact_literal_pin",
      "2026-01-02",
      50_000_000,
      "unverified",
      "candidate",
      "Other subject",
      "https://data.norfolk.gov/resource/qva7-tzrf.json",
      "2026-11-07T00:00:00.000Z",
    );
  database.sqlite
    .prepare(`INSERT INTO buy_boxes
    (id,name,property_types_json,jurisdictions_json,neighborhoods_json,zips_json,min_size_value,max_size_value,size_basis,min_value_cents,max_value_cents,value_basis,value_assumption_label,distress_phases_json,version,created_at,created_by,updated_at,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      "bb-real",
      "Norfolk exact",
      '["sfh"]',
      '["norfolk-va"]',
      "[]",
      '["23509"]',
      null,
      null,
      "none",
      null,
      null,
      "assessed_value",
      null,
      '["early_distress"]',
      3,
      "2026-11-07T00:00:00.000Z",
      actor,
      "2026-11-07T00:00:00.000Z",
      actor,
    );
}

describe("C/E persisted decision support", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
    seed(database);
  });
  afterEach(() => database.close());

  it("persists named flip scenarios in cents with actual results, sensitivity, candidates and optimistic versions", async () => {
    const created = await upsertPropertyScenario(database.binding, actor, key, {
      id: null,
      expectedVersion: 0,
      name: "Dated partner flip",
      kind: "flip",
      financing: null,
      inputs: flipInputs(),
      sensitivity: [{ name: "Lower explicit exit", overrides: { salePrice: cell(280_000) } }],
      candidateSelections: [
        {
          saleId: "sale-real-1",
          disposition: "selected_support",
          reason: "Review as supporting transfer only",
        },
      ],
    });
    assert.equal(created.version, 1);
    assert.equal(
      (created.inputs as Record<string, { valueCents: number }>)["purchasePrice"]?.valueCents,
      20_000_000,
    );
    assert.equal((created.result as { monetaryUnit: string }).monetaryUnit, "USD dollars");
    const result = created.result as {
      evaluation: { status: string; value: { profit: number; cashInvested: number } };
      sensitivity: { status: string; value: unknown[] };
    };
    assert.equal(result.evaluation.status, "ok");
    assert.equal(result.evaluation.value.profit, 22_700);
    assert.ok(result.evaluation.value.cashInvested > 0);
    assert.equal(result.sensitivity.status, "ok");
    assert.equal(result.sensitivity.value.length, 1);
    assert.equal(
      created.saleCandidateReferences[0]?.boundary.includes("never a verified subject exit"),
      true,
    );
    const updated = await upsertPropertyScenario(database.binding, partner, key, {
      id: created.id,
      expectedVersion: 1,
      name: "Dated partner flip revised",
      kind: "flip",
      financing: null,
      inputs: { ...flipInputs(), rehab: cell(0) },
      sensitivity: [],
      candidateSelections: [
        { saleId: "sale-real-1", disposition: "excluded", reason: "Condition is unknown" },
      ],
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.updatedBy, partner);
    assert.equal(
      (updated.inputs as Record<string, { valueCents: number }>)["rehab"]?.valueCents,
      0,
    );
    await assert.rejects(
      upsertPropertyScenario(database.binding, actor, key, {
        id: created.id,
        expectedVersion: 1,
        name: "Stale",
        kind: "flip",
        financing: null,
        inputs: flipInputs(),
        sensitivity: [],
        candidateSelections: [],
      }),
      ScenarioBenchmarkConflictError,
    );
    assert.equal((await loadPropertyScenarios(database.binding, key)).length, 1);
  });

  it("retains independent assumption dates, every sensitivity, and frozen sale evidence through ordinary edits and source loss", async () => {
    const created = await upsertPropertyScenario(database.binding, actor, key, {
      id: null,
      expectedVersion: 0,
      name: "Durable evidence",
      kind: "flip",
      financing: null,
      inputs: {
        ...flipInputs(),
        purchasePrice: datedCell(200_000, "2026-11-07"),
        rehab: datedCell(30_000, "2026-10-01"),
      },
      sensitivity: [
        { name: "Lower exit", overrides: { salePrice: datedCell(280_000, "2026-09-15") } },
        { name: "Higher rehab", overrides: { rehab: datedCell(40_000, "2026-08-20") } },
      ],
      candidateSelections: [
        {
          saleId: "sale-real-1",
          disposition: "selected_support",
          reason: "Saved supporting transfer",
        },
      ],
    });
    database.sqlite
      .prepare(
        "UPDATE property_sales SET sale_price_cents=50000000,qualification_status='excluded_package',exclusion_reason='Package sale' WHERE id='sale-real-1'",
      )
      .run();
    const changed = (await loadPropertyScenarios(database.binding, key))[0]!;
    assert.equal(changed.saleCandidateReferences[0]?.savedEvidence?.salePriceCents, 25_000_000);
    assert.equal(changed.saleCandidateReferences[0]?.currentSourceStatus, "changed_excluded");
    database.sqlite.prepare("DELETE FROM property_sales WHERE id='sale-real-1'").run();
    database.sqlite.prepare("DELETE FROM watchlist_properties WHERE property_key=?").run(key);

    const updated = await upsertPropertyScenario(database.binding, partner, key, {
      id: created.id,
      expectedVersion: created.version,
      name: "Durable evidence renamed",
      kind: "flip",
      financing: null,
      inputs: {
        ...flipInputs(),
        purchasePrice: datedCell(200_000, "2026-11-07"),
        rehab: datedCell(30_000, "2026-10-01"),
      },
      sensitivity: [
        { name: "Lower exit", overrides: { salePrice: datedCell(280_000, "2026-09-15") } },
        { name: "Higher rehab", overrides: { rehab: datedCell(40_000, "2026-08-20") } },
      ],
      candidateSelections: [],
    });
    assert.equal((updated.inputs as Record<string, { asOf: string }>)["rehab"]?.asOf, "2026-10-01");
    assert.equal((updated.sensitivity as unknown[]).length, 2);
    assert.equal(updated.saleCandidateReferences[0]?.savedEvidence?.salePriceCents, 25_000_000);
    assert.equal(updated.saleCandidateReferences[0]?.currentSourceStatus, "missing");
    assert.equal(updated.saleCandidateReferences[0]?.disposition, "selected_support");
    const explicitlyRemoved = await upsertPropertyScenario(database.binding, partner, key, {
      id: updated.id,
      expectedVersion: updated.version,
      name: updated.name,
      kind: "flip",
      financing: null,
      inputs: {
        ...flipInputs(),
        purchasePrice: datedCell(200_000, "2026-11-07"),
        rehab: datedCell(30_000, "2026-10-01"),
      },
      sensitivity: [
        { name: "Lower exit", overrides: { salePrice: datedCell(280_000, "2026-09-15") } },
        { name: "Higher rehab", overrides: { rehab: datedCell(40_000, "2026-08-20") } },
      ],
      candidateSelections: [],
      candidateRemovals: ["sale-real-1"],
    });
    assert.equal(explicitlyRemoved.saleCandidateReferences.length, 0);
  });

  it("keeps unknown distinct from zero, requires dated assumptions, and blocks semantic provenance laundering", async () => {
    const unknown = await upsertPropertyScenario(database.binding, actor, key, {
      id: null,
      expectedVersion: 0,
      name: "Incomplete rental",
      kind: "rental",
      financing: "cash",
      inputs: { purchasePrice: null, rehab: cell(0) },
      sensitivity: [],
      candidateSelections: [],
    });
    const evaluation = (
      unknown.result as { evaluation: { status: string; issues: Array<{ path: string }> } }
    ).evaluation;
    assert.equal(evaluation.status, "missing");
    assert.ok(evaluation.issues.some((issue) => issue.path === "inputs.purchasePrice.value"));
    assert.equal(
      (unknown.inputs as Record<string, { valueCents: number | null }>)["purchasePrice"]
        ?.valueCents,
      null,
    );
    assert.equal(
      (unknown.inputs as Record<string, { valueCents: number | null }>)["rehab"]?.valueCents,
      0,
    );
    await assert.rejects(
      upsertPropertyScenario(database.binding, actor, key, {
        id: null,
        expectedVersion: 0,
        name: "Forged record",
        kind: "flip",
        financing: null,
        inputs: {
          purchasePrice: {
            value: 200_000,
            asOf,
            provenance: { kind: "record", reference: "assessment" },
          } as never,
        },
        sensitivity: [],
        candidateSelections: [],
      }),
      /cannot assert verified-record provenance/,
    );
    await assert.rejects(
      upsertPropertyScenario(database.binding, actor, key, {
        id: null,
        expectedVersion: 0,
        name: "Wrong sale reference",
        kind: "flip",
        financing: null,
        inputs: flipInputs(),
        sensitivity: [],
        candidateSelections: [
          { saleId: "sale-other", disposition: "selected_support", reason: "Not the subject" },
        ],
      }),
      /persisted official candidate for this subject/,
    );
    await assert.rejects(
      upsertPropertyScenario(database.binding, actor, key, {
        id: null,
        expectedVersion: 0,
        name: "Fractional cent",
        kind: "flip",
        financing: null,
        inputs: { ...flipInputs(), rehab: cell(1.001) },
        sensitivity: [],
        candidateSelections: [],
      }),
      /two decimal places/,
    );
  });

  it("models cash and financed rentals explicitly with first-stabilized-year and separate elapsed balance boundaries", async () => {
    const cash = await upsertPropertyScenario(database.binding, actor, key, {
      id: null,
      expectedVersion: 0,
      name: "Cash rental",
      kind: "rental",
      financing: "cash",
      inputs: rentalInputs("cash"),
      sensitivity: [{ name: "Explicit higher rent", overrides: { monthlyRent: cell(2_700) } }],
      candidateSelections: [],
    });
    const financed = await upsertPropertyScenario(database.binding, actor, key, {
      id: null,
      expectedVersion: 0,
      name: "Financed rental",
      kind: "rental",
      financing: "amortizing",
      inputs: rentalInputs("amortizing"),
      sensitivity: [],
      candidateSelections: [],
    });
    const cashResult = cash.result as {
      evaluation: { status: string; value: { annualDebtService: number } };
    };
    const financedResult = financed.result as {
      evaluation: {
        status: string;
        value: {
          annualDebtService: number;
          remainingLoanBalance: number;
          maxPurchaseForTargetYield: { status: string };
        };
      };
      annualRentalPeriod: string;
      elapsedLoanMonthsBoundary: string;
      rentalMaximumOfferBoundary: string;
    };
    assert.equal(cashResult.evaluation.value.annualDebtService, 0);
    assert.ok(financedResult.evaluation.value.annualDebtService > 0);
    assert.ok(financedResult.evaluation.value.remainingLoanBalance > 0);
    assert.equal(financedResult.evaluation.value.maxPurchaseForTargetYield.status, "feasible");
    assert.match(financedResult.annualRentalPeriod, /first 12 stabilized/);
    assert.match(financedResult.elapsedLoanMonthsBoundary, /separate/);
    assert.match(financedResult.rentalMaximumOfferBoundary, /unlevered NOI/);
  });

  it("persists a cryptographic blind order, quarantines exact malformed IDs, hides every source hint, supports partner review/reload and irreversible reveal", async () => {
    const created = await createBlindBenchmark(database.binding, actor, {
      privateName: "=PRIVATE Vendor comparison",
      market: "norfolk-va",
      asOfDate: asOf,
      buyBoxId: "bb-real",
      propertyKeys: [key, otherKey],
      competitorCsv: "parcel,score\n15834200,99\n87654321,3\n87654321,4\n,7\n123,2\n",
      tokenHeader: "parcel",
      competitorLabel: "=PRIVATE Vendor",
      fileName: "private-vendor-export.csv",
      mode: "test-only",
      licenseAcknowledged: true,
    });
    assert.equal(created.status, "reviewing");
    assert.equal(created.role, "setup_creator");
    assert.equal(created.canReview, false);
    const serialized = JSON.stringify(created);
    for (const secret of [
      "PRIVATE",
      "private-vendor-export.csv",
      "internal-selected",
      "licensed-export",
      "datasetCounts",
      '"sources"',
    ]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
    assert.match(created.buyBoxFingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(created.frozenCriteria!.zips, ["23509"]);
    assert.equal(JSON.stringify(created.frozenCriteria).includes("ericventor97"), false);
    database.sqlite
      .prepare("UPDATE buy_boxes SET zips_json='[\"23510\"]',version=4 WHERE id='bb-real'")
      .run();
    const reviewer = await loadBlindBenchmark(database.binding, partner, created.id);
    assert.deepEqual(reviewer.frozenCriteria!.zips, ["23509"]);
    assert.equal(reviewer.role, "independent_reviewer");
    assert.equal(reviewer.canReview, true);
    assert.deepEqual(reviewer.cards, created.cards);
    assert.equal(reviewer.metrics.union.expectedJudgments, reviewer.cards.length);
    assert.equal(reviewer.metrics.union.missingJudgments, reviewer.cards.length);
    await assert.rejects(
      revealBlindBenchmark(database.binding, actor, created.id, {
        expectedVersion: 1,
        confirmation: "REVEAL SOURCES",
      }),
      /every assigned reviewer must review every blind card/i,
    );
    database.sqlite
      .prepare(
        "INSERT INTO blind_benchmark_reviews (benchmark_id,card_id,reviewer_email,useful,correctness,reason,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)",
      )
      .run(created.id, "invalid-card", partner, "yes", "yes", "invalid slot", asOf, asOf);
    assert.equal((await loadBlindBenchmark(database.binding, actor, created.id)).canReveal, false);
    let reviewed = reviewer;
    for (const card of reviewer.cards) {
      reviewed = await upsertBlindReview(database.binding, partner, created.id, {
        cardId: card.cardId,
        expectedVersion: 0,
        useful: "unknown",
        correctness: "unknown",
        researchSeconds: null,
        reason: "Independent fixture review remains unknown",
      });
    }
    assert.equal(reviewed.ownReviews.length, reviewer.cards.length);
    assert.equal(reviewed.metrics.union.missingJudgments, 0);
    assert.equal((await loadBlindBenchmark(database.binding, actor, created.id)).canReveal, true);
    await assert.rejects(
      upsertBlindReview(database.binding, partner, created.id, {
        cardId: reviewer.cards[0]!.cardId,
        expectedVersion: 0,
        useful: "yes",
        correctness: "yes",
        researchSeconds: 1,
        reason: "stale",
      }),
      ScenarioBenchmarkConflictError,
    );
    await assert.rejects(
      revealBlindBenchmark(database.binding, actor, created.id, {
        expectedVersion: 1,
        confirmation: "reveal",
      }),
      ScenarioBenchmarkValidationError,
    );
    const revealed = await revealBlindBenchmark(database.binding, actor, created.id, {
      expectedVersion: 1,
      confirmation: "REVEAL SOURCES",
    });
    assert.equal(revealed.status, "revealed");
    assert.equal(revealed.metrics.datasetCounts?.overlapProperties, 1);
    assert.equal(revealed.metrics.datasetCounts?.uncertainRows, 2);
    assert.equal(revealed.metrics.datasetCounts?.duplicateRows, 1);
    assert.equal(revealed.metrics.sources?.length, 2);
    assert.equal(revealed.reveal?.imports.length, 2);
    assert.equal(
      database.sqlite
        .prepare("SELECT COUNT(*) n FROM property_feedback WHERE data_source='held_out_benchmark'")
        .get()?.["n"],
      0,
    );
    const exported = await revealedBenchmarkCsv(database.binding, actor, created.id);
    assert.match(exported, /descriptive-only/);
    assert.match(exported, /"'=PRIVATE Vendor"/);
    assert.match(exported, /test-only/i);
    assert.match(exported, /synthetic test fixture/i);
    await assert.rejects(
      upsertBlindReview(database.binding, partner, created.id, {
        cardId: reviewer.cards[1]!.cardId,
        expectedVersion: 0,
        useful: "unknown",
        correctness: "unknown",
        researchSeconds: null,
        reason: "closed",
      }),
      /closed after reveal/,
    );
  });

  it("atomically rolls back review and audit failures and rejects a paused review after reveal", async () => {
    const created = await createBlindBenchmark(database.binding, actor, {
      privateName: "Atomic review",
      market: "norfolk-va",
      asOfDate: asOf,
      buyBoxId: "bb-real",
      propertyKeys: [key],
      competitorCsv: "parcel\n15834200\n",
      tokenHeader: "parcel",
      competitorLabel: "Test fixture",
      fileName: "fixture.csv",
      mode: "test-only",
      licenseAcknowledged: true,
    });
    const firstCard = created.cards[0]!;
    database.failNextBatchAfterStatement(1);
    await assert.rejects(
      upsertBlindReview(database.binding, partner, created.id, {
        cardId: firstCard.cardId,
        expectedVersion: 0,
        useful: "no",
        correctness: "no",
        researchSeconds: 2,
        reason: "Injected audit rollback",
      }),
      /Injected transactional batch failure/,
    );
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM blind_benchmark_reviews").get()?.["n"],
      0,
    );
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM blind_benchmark_review_audit").get()?.["n"],
      0,
    );
    for (const card of created.cards) {
      await upsertBlindReview(database.binding, partner, created.id, {
        cardId: card.cardId,
        expectedVersion: 0,
        useful: "no",
        correctness: "no",
        researchSeconds: 2,
        reason: "Complete review coverage",
      });
    }
    let release!: () => void;
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    let paused!: () => void;
    const reachedPause = new Promise<void>((resolve) => {
      paused = resolve;
    });
    database.beforeNextBatch(/blind_benchmark_reviews/, async () => {
      paused();
      await resume;
    });
    const lateWrite = upsertBlindReview(database.binding, partner, created.id, {
      cardId: firstCard.cardId,
      expectedVersion: 1,
      useful: "yes",
      correctness: "yes",
      researchSeconds: 3,
      reason: "Must not land after reveal",
    });
    await reachedPause;
    const revealed = await revealBlindBenchmark(database.binding, actor, created.id, {
      expectedVersion: 1,
      confirmation: "REVEAL SOURCES",
    });
    release();
    assert.equal(revealed.status, "revealed");
    await assert.rejects(lateWrite, /closed after reveal|changed/i);
    const persisted = database.sqlite
      .prepare(
        "SELECT useful,version FROM blind_benchmark_reviews WHERE benchmark_id=? AND card_id=? AND reviewer_email=? COLLATE NOCASE",
      )
      .get(created.id, firstCard.cardId, partner);
    assert.equal(persisted?.["useful"], "no");
    assert.equal(persisted?.["version"], 1);
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM blind_benchmark_review_audit WHERE benchmark_id=? AND card_id=?",
        )
        .get(created.id, firstCard.cardId)?.["n"],
      1,
    );
  });

  it("rejects oversized CSV before writes and lists an honest empty benchmark state", async () => {
    assert.deepEqual(await listBlindBenchmarks(database.binding, actor), []);
    await assert.rejects(
      createBlindBenchmark(database.binding, actor, {
        privateName: "Oversized",
        market: "norfolk-va",
        asOfDate: asOf,
        buyBoxId: "bb-real",
        propertyKeys: [key],
        competitorCsv: `parcel\n${"1".repeat(61_000)}`,
        tokenHeader: "parcel",
        competitorLabel: "Licensed export",
        fileName: "licensed.csv",
        mode: "live",
        licenseAcknowledged: true,
      }),
      /must not exceed/,
    );
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM blind_benchmarks").get()?.["n"],
      0,
    );
  });
});
