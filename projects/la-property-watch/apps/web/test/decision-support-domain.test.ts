import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  benchmarkMetrics,
  blindCards,
  buildDataset,
  createBlindState,
  evaluateFlip,
  evaluateRental,
  mapIdentifierCsv,
  parseCsv,
  type Result,
  restoreBlindState,
  sensitivity,
  validateReviews,
} from "../src/lib/decision-support/index.ts";

const cell = (value: number | null) => ({
  value,
  provenance: { kind: "test-fixture" as const, asOf: null },
});
const values = (input: Record<string, number>) =>
  Object.fromEntries(Object.entries(input).map(([key, value]) => [key, cell(value)]));
const flip = () => ({
  kind: "flip" as const,
  name: "SYNTHETIC flip",
  inputs: values({
    purchasePrice: 200_000,
    acquisitionFixed: 2_000,
    acquisitionRate: 0.02,
    rehab: 30_000,
    contingencyRate: 0.1,
    holdingMonths: 6,
    holdingMonthly: 1_000,
    loanToPurchase: 0.8,
    annualInterestRate: 0.12,
    originationRate: 0.02,
    financingFixed: 500,
    salePrice: 300_000,
    sellingRate: 0.06,
    sellingFixed: 1_000,
    targetProfit: 25_000,
  }),
});
const rental = () => ({
  kind: "rental" as const,
  name: "SYNTHETIC rental",
  financing: "amortizing" as const,
  inputs: values({
    purchasePrice: 200_000,
    acquisitionFixed: 2_000,
    acquisitionRate: 0.02,
    rehab: 30_000,
    contingencyRate: 0.1,
    stabilizationMonths: 2,
    stabilizationMonthly: 1_000,
    loanToPurchase: 0.8,
    annualInterestRate: 0.06,
    originationRate: 0.02,
    financingFixed: 500,
    loanTermMonths: 360,
    elapsedLoanMonths: 12,
    monthlyRent: 2_500,
    otherMonthlyIncome: 100,
    vacancyRate: 0.05,
    monthlyTaxes: 300,
    monthlyInsurance: 100,
    monthlyHoa: 0,
    otherMonthlyOperating: 50,
    maintenanceRate: 0.05,
    managementRate: 0.08,
    monthlyCapex: 150,
    targetAllInYield: 0.08,
  }),
});
const unwrap = <T>(result: Result<T>): T => {
  if (result.status !== "ok") {
    throw new Error(`Expected ok result, received ${result.status}.`);
  }
  return result.value as T;
};
const near = (actual: number, expected: number, tolerance = 1e-7) => {
  if (Math.abs(actual - expected) > tolerance * Math.max(1, Math.abs(expected))) {
    throw new Error(`${actual} != ${expected}`);
  }
};
const setup = {
  market: "TEST-MARKET",
  asOf: "2026-01-01",
  buybox: "sha256:TEST-v1",
  mode: "test-only" as const,
};
const rules = [{ market: "TEST-MARKET", scheme: "parcel", pattern: "[0-9]{3}" }];
const row = (token: unknown) => ({ market: "TEST-MARKET", scheme: "parcel", token });
const sources = () => [
  {
    id: "ours",
    label: "PRIVATE OURS",
    context: setup,
    provenance: "test-fixture" as const,
    rows: [row("001"), row("002"), row("002"), row(""), row(" 001")],
  },
  {
    id: "competitor",
    label: "PRIVATE COMPETITOR",
    context: setup,
    provenance: "test-fixture" as const,
    rows: [row("002"), row("003")],
  },
];
const fixtureRandom = () => {
  let state = 1827;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

describe("integrated decision-support domain helpers", () => {
  it("preserves independently hand-calculated flip identities and maximum offer", () => {
    const result = unwrap(evaluateFlip(flip()));
    near(result.profit, 22_700);
    near(result.cashInvested, 98_300);
    near(result.exitCash - result.cashInvested, result.profit);
    near(result.maxPurchaseForTargetProfit.amount!, 197_878.2287822878);
    const atBreakEven = flip();
    atBreakEven.inputs["salePrice"] = cell(result.breakEvenSale);
    near(unwrap(evaluateFlip(atBreakEven)).profit, 0);
  });

  it("keeps zero distinct from missing and rejects malformed numeric/provenance values", () => {
    const missing = flip();
    delete missing.inputs["rehab"];
    assert.equal(evaluateFlip(missing).status, "missing");
    const zero = flip();
    zero.inputs["rehab"] = cell(0);
    assert.equal(evaluateFlip(zero).status, "ok");
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, "0", false]) {
      const scenario = flip();
      scenario.inputs["purchasePrice"] = cell(bad as number);
      assert.equal(evaluateFlip(scenario).status, "invalid");
    }
    const forged = flip();
    forged.inputs["rehab"] = {
      value: 1,
      provenance: {
        kind: { toString: () => "record" } as never,
        asOf: "2026-01-01",
        reference: "x",
      },
    } as never;
    assert.equal(evaluateFlip(forged).status, "invalid");
  });

  it("matches amortization boundaries and separates first stabilized year from elapsed balance", () => {
    const result = unwrap(evaluateRental(rental()));
    near(result.monthlyDebtPayment, 959.2808402444039);
    near(result.remainingLoanBalance, 158_035.18126035726);
    near(result.annualNOI, 20_386.8);
    assert.ok(result.annualDebtService > 0);
    const matured = rental();
    matured.inputs["elapsedLoanMonths"] = cell(600);
    const maturedResult = unwrap(evaluateRental(matured));
    assert.equal(maturedResult.remainingLoanBalance, 0);
    assert.equal(maturedResult.annualDebtService, result.annualDebtService);
  });

  it("enforces explicit cash financing and unlevered pre-capex rental offer math", () => {
    const cash = { ...rental(), financing: "cash" as const };
    for (const field of [
      "loanToPurchase",
      "annualInterestRate",
      "originationRate",
      "financingFixed",
      "loanTermMonths",
    ] as const) {
      cash.inputs[field] = cell(0);
    }
    const result = unwrap(evaluateRental(cash));
    assert.equal(result.annualDebtService, 0);
    const target = rental();
    target.inputs["purchasePrice"] = cell(result.maxPurchaseForTargetYield.amount!);
    const targetResult = unwrap(evaluateRental(target));
    near(targetResult.allInUnleveredYield!, 0.08);
  });

  it("calculates only caller-named absolute sensitivities and never mutates the base", () => {
    const base = flip();
    const snapshot = structuredClone(base);
    const result = unwrap(
      sensitivity(base, [
        { name: "Lower exit", overrides: { salePrice: cell(280_000) } },
        { name: "Missing rehab", overrides: { rehab: cell(null) } },
      ]),
    );
    assert.equal(result.length, 2);
    assert.deepEqual(base, snapshot);
    assert.equal(
      sensitivity(base, [{ name: "Bad", overrides: { invented: cell(1) } }]).status,
      "invalid",
    );
  });

  it("parses bounded RFC4180 CSV exactly and maps only the selected identifier", () => {
    const csv = 'parcel,score,notes\r\n"001",99,"line 1\nline 2"\r\n002,4,"x""y"';
    const parsed = unwrap(parseCsv(csv));
    assert.deepEqual(parsed.headers, ["parcel", "score", "notes"]);
    assert.equal(parsed.rows[0]?.[2], "line 1\nline 2");
    const mapped = unwrap(
      mapIdentifierCsv(csv, {
        market: { constant: "TEST-MARKET" },
        scheme: { constant: "parcel" },
        token: "parcel",
      }),
    );
    assert.deepEqual(mapped[0], { market: "TEST-MARKET", scheme: "parcel", token: "001" });
    assert.equal(parseCsv('a\n"unterminated').status, "invalid");
    assert.equal(parseCsv("a,a\n1,2").status, "invalid");
  });

  it("counts duplicates, overlap and uncertain exact identifiers without repair", () => {
    const dataset = unwrap(buildDataset(setup, sources(), rules));
    assert.deepEqual(dataset.counts, {
      rawRows: 7,
      validRows: 5,
      uncertainRows: 2,
      duplicateRows: 1,
      uniqueProperties: 3,
      overlapProperties: 1,
    });
    assert.equal(dataset.quarantine.length, 2);
    assert.equal(
      dataset.properties.some((property) => property.identifier.token === " 001"),
      false,
    );
  });

  it("persists one opaque randomized order and rejects corrupt or vendor-specific blind states", () => {
    const dataset = unwrap(buildDataset(setup, sources(), rules));
    const state = unwrap(createBlindState(dataset, fixtureRandom()));
    const first = unwrap(blindCards(state));
    assert.deepEqual(unwrap(blindCards(JSON.parse(JSON.stringify(state)))), first);
    const corrupt = structuredClone(state);
    corrupt.cards[0]!.cardId = `c_${"0".repeat(32)}`;
    corrupt.cards[1]!.cardId = corrupt.cards[0]!.cardId;
    assert.equal(restoreBlindState(corrupt).status, "invalid");
    const vendorDataset = unwrap(
      buildDataset(
        setup,
        sources().map((source) => ({
          ...source,
          rows: source.rows.map((entry) => ({ ...entry, scheme: "vendor-id" })),
        })),
        [{ ...rules[0]!, scheme: "vendor-id" }],
      ),
    );
    assert.equal(createBlindState(vendorDataset, fixtureRandom()).status, "invalid");
  });

  it("blind projections and metrics contain no source labels until literal reveal", () => {
    const state = unwrap(
      createBlindState(unwrap(buildDataset(setup, sources(), rules)), fixtureRandom()),
    );
    const cards = unwrap(blindCards(state));
    const reviews = [
      {
        cardId: cards[0]!.cardId,
        reviewerId: "r1",
        useful: "unknown" as const,
        correctness: "no" as const,
        researchSeconds: null,
        reason: "Fixture review",
      },
    ];
    assert.equal(validateReviews(state, reviews, ["r1"]).status, "ok");
    const blind = unwrap(benchmarkMetrics(state, reviews, { reveal: false, reviewerIds: ["r1"] }));
    const blindText = JSON.stringify(blind);
    assert.doesNotMatch(blindText, /PRIVATE|ours|competitor|datasetCounts|sources/);
    const revealed = unwrap(
      benchmarkMetrics(state, reviews, { reveal: true, reviewerIds: ["r1"] }),
    );
    assert.equal(revealed.datasetCounts?.overlapProperties, 1);
    assert.equal(revealed.sources?.length, 2);
  });

  it("separates yes/no/unknown/missing judgments, time coverage and reviewer agreement", () => {
    const state = unwrap(
      createBlindState(unwrap(buildDataset(setup, sources(), rules)), fixtureRandom()),
    );
    const cards = unwrap(blindCards(state));
    const reviews = [
      {
        cardId: cards[0]!.cardId,
        reviewerId: "r1",
        useful: "yes" as const,
        correctness: "yes" as const,
        researchSeconds: 60,
        reason: "Fixture",
      },
      {
        cardId: cards[0]!.cardId,
        reviewerId: "r2",
        useful: "yes" as const,
        correctness: "no" as const,
        researchSeconds: 60,
        reason: "Fixture",
      },
      {
        cardId: cards[1]!.cardId,
        reviewerId: "r1",
        useful: "unknown" as const,
        correctness: "unknown" as const,
        researchSeconds: null,
        reason: "Fixture",
      },
    ];
    const metrics = unwrap(
      benchmarkMetrics(state, reviews, { reveal: false, reviewerIds: ["r1", "r2"] }),
    );
    assert.equal(metrics.union.expectedJudgments, 6);
    assert.equal(metrics.union.missingJudgments, 3);
    assert.equal(metrics.union.useful.yes, 2);
    assert.equal(metrics.union.useful.unknown, 1);
    assert.equal(metrics.union.time.secondsPerTimedUsefulJudgment, 60);
    assert.equal(metrics.union.time.secondsPerTimedUsefulProperty, 120);
    assert.equal(metrics.agreement[0]?.correctness.agreementRatio, 0);
  });
});
