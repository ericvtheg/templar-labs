import {
  bad,
  dateOnly,
  failure,
  finite,
  type Issue,
  ok,
  own,
  type Result,
  ratio,
  record,
  text,
} from "./validation.ts";

export type Provenance = {
  kind: "user-assumption" | "record" | "test-fixture";
  asOf: string | null;
  reference?: string;
};
export interface Assumption {
  value: number | null;
  provenance: Provenance;
}
export const MONEY_LIMIT = 1_000_000_000;
export type CommonField =
  | "purchasePrice"
  | "acquisitionFixed"
  | "acquisitionRate"
  | "rehab"
  | "contingencyRate"
  | "loanToPurchase"
  | "annualInterestRate"
  | "originationRate"
  | "financingFixed";
export type FlipField =
  | CommonField
  | "holdingMonths"
  | "holdingMonthly"
  | "salePrice"
  | "sellingRate"
  | "sellingFixed"
  | "targetProfit";
export type RentalField =
  | CommonField
  | "stabilizationMonths"
  | "stabilizationMonthly"
  | "loanTermMonths"
  | "elapsedLoanMonths"
  | "monthlyRent"
  | "otherMonthlyIncome"
  | "vacancyRate"
  | "monthlyTaxes"
  | "monthlyInsurance"
  | "monthlyHoa"
  | "otherMonthlyOperating"
  | "maintenanceRate"
  | "managementRate"
  | "monthlyCapex"
  | "targetAllInYield";
export type Inputs<K extends string> = Partial<Record<K, Assumption | null>>;
export interface FlipScenario {
  kind: "flip";
  name: string;
  inputs: Inputs<FlipField>;
}
export interface RentalScenario {
  kind: "rental";
  name: string;
  financing: "cash" | "amortizing";
  inputs: Inputs<RentalField>;
}
export type Scenario = FlipScenario | RentalScenario;
export interface Solution {
  status: "feasible" | "infeasible" | "outside-domain";
  amount: number | null;
}
interface Rule {
  min: number;
  max: number;
  integer?: boolean;
}
const money: Rule = { min: 0, max: MONEY_LIMIT };
const rate: Rule = { min: 0, max: 1 };
const months: Rule = { min: 0, max: 600, integer: true };
const common: Record<CommonField, Rule> = {
  purchasePrice: money,
  acquisitionFixed: money,
  acquisitionRate: rate,
  rehab: money,
  contingencyRate: rate,
  loanToPurchase: rate,
  annualInterestRate: rate,
  originationRate: rate,
  financingFixed: money,
};
const flipRules: Record<FlipField, Rule> = {
  ...common,
  holdingMonths: months,
  holdingMonthly: money,
  salePrice: money,
  sellingRate: { min: 0, max: 0.99 },
  sellingFixed: money,
  targetProfit: money,
};
const rentalRules: Record<RentalField, Rule> = {
  ...common,
  stabilizationMonths: months,
  stabilizationMonthly: money,
  loanTermMonths: months,
  elapsedLoanMonths: { min: 0, max: 1200, integer: true },
  monthlyRent: money,
  otherMonthlyIncome: money,
  vacancyRate: rate,
  monthlyTaxes: money,
  monthlyInsurance: money,
  monthlyHoa: money,
  otherMonthlyOperating: money,
  maintenanceRate: rate,
  managementRate: rate,
  monthlyCapex: money,
  targetAllInYield: { min: 0.0001, max: 1 },
};
const solution = (value: number): Solution =>
  value < 0
    ? { status: "infeasible", amount: null }
    : !Number.isFinite(value) || value > MONEY_LIMIT
      ? { status: "outside-domain", amount: null }
      : { status: "feasible", amount: value === 0 ? 0 : value };

function read<K extends string>(
  input: unknown,
  kind: Scenario["kind"],
  rules: Record<K, Rule>,
): Result<{ name: string; n: Record<K, number> }> {
  if (!record(input)) {
    return bad("scenario", "Expected a plain object");
  }
  const issues: Issue[] = [];
  if (input.kind !== kind) {
    issues.push({ path: "kind", code: "invalid", message: `Expected ${kind}` });
  }
  if (!text(input.name, 160)) {
    issues.push({ path: "name", code: "invalid", message: "A nonempty scenario name is required" });
  }
  if (!record(input.inputs)) {
    return bad("inputs", "Expected explicit assumption objects");
  }
  const fields = input.inputs;
  const n = {} as Record<K, number>;
  for (const key of Object.keys(fields)) {
    if (!Object.hasOwn(rules, key)) {
      issues.push({ path: `inputs.${key}`, code: "invalid", message: "Unknown input field" });
    }
  }
  for (const key of Object.keys(rules) as K[]) {
    const value = own(fields, key);
    const path = `inputs.${key}`;
    if (value === null || value === undefined) {
      issues.push({
        path,
        code: "missing",
        message: "Explicit input required; zero is not inferred",
      });
      continue;
    }
    if (!record(value)) {
      issues.push({ path, code: "invalid", message: "Expected value and provenance" });
      continue;
    }
    const provenance = value.provenance;
    if (
      !record(provenance) ||
      typeof provenance.kind !== "string" ||
      !["user-assumption", "record", "test-fixture"].includes(provenance.kind) ||
      !(provenance.asOf === null || dateOnly(provenance.asOf)) ||
      (provenance.kind === "record" &&
        (!dateOnly(provenance.asOf) || !text(provenance.reference, 2000))) ||
      (provenance.reference !== undefined && !text(provenance.reference, 2000))
    ) {
      issues.push({
        path: `${path}.provenance`,
        code: "invalid",
        message: "Valid provenance/asOf required; records require date and reference",
      });
    }
    const amount = value.value;
    if (amount === null || amount === undefined) {
      issues.push({ path: `${path}.value`, code: "missing", message: "Input is unknown" });
      continue;
    }
    const rule = rules[key];
    if (!finite(amount, rule.min, rule.max, rule.integer)) {
      issues.push({
        path: `${path}.value`,
        code: "invalid",
        message: `Expected finite ${rule.integer ? "integer " : ""}number in [${rule.min}, ${rule.max}]`,
      });
    } else {
      n[key] = amount;
    }
  }
  return issues.length ? failure(issues) : ok({ name: input.name as string, n });
}

export interface FlipResult {
  model: "flip-interest-only-v1";
  name: string;
  loanPrincipal: number;
  acquisitionCosts: number;
  rehab: number;
  contingency: number;
  rehabWithContingency: number;
  holding: number;
  interest: number;
  origination: number;
  financingFixed: number;
  preSaleCosts: number;
  sellingCosts: number;
  totalCosts: number;
  cashInvested: number;
  exitCash: number;
  profit: number;
  cashROI: number | null;
  breakEvenSale: number;
  maxPurchaseForTargetProfit: Solution;
}

export function evaluateFlip(input: unknown): Result<FlipResult> {
  const parsed = read(input, "flip", flipRules);
  if (parsed.status !== "ok") {
    return parsed;
  }
  const { name, n } = parsed.value;
  const loanPrincipal = n.purchasePrice * n.loanToPurchase;
  const acquisitionCosts = n.acquisitionFixed + n.purchasePrice * n.acquisitionRate;
  const contingency = n.rehab * n.contingencyRate;
  const rehabWithContingency = n.rehab + contingency;
  const holding = n.holdingMonths * n.holdingMonthly;
  const interest = (loanPrincipal * n.annualInterestRate * n.holdingMonths) / 12;
  const origination = loanPrincipal * n.originationRate;
  const preSaleCosts =
    n.purchasePrice +
    acquisitionCosts +
    rehabWithContingency +
    holding +
    interest +
    origination +
    n.financingFixed;
  const sellingCosts = n.salePrice * n.sellingRate + n.sellingFixed;
  const totalCosts = preSaleCosts + sellingCosts;
  const cashInvested = preSaleCosts - loanPrincipal;
  const exitCash = n.salePrice - sellingCosts - loanPrincipal;
  const profit = n.salePrice - totalCosts;
  const max =
    (n.salePrice * (1 - n.sellingRate) -
      n.acquisitionFixed -
      rehabWithContingency -
      holding -
      n.financingFixed -
      n.sellingFixed -
      n.targetProfit) /
    (1 +
      n.acquisitionRate +
      n.loanToPurchase * (n.originationRate + (n.annualInterestRate * n.holdingMonths) / 12));
  return ok({
    model: "flip-interest-only-v1",
    name,
    loanPrincipal,
    acquisitionCosts,
    rehab: n.rehab,
    contingency,
    rehabWithContingency,
    holding,
    interest,
    origination,
    financingFixed: n.financingFixed,
    preSaleCosts,
    sellingCosts,
    totalCosts,
    cashInvested,
    exitCash,
    profit,
    cashROI: ratio(profit, cashInvested),
    breakEvenSale: (preSaleCosts + n.sellingFixed) / (1 - n.sellingRate),
    maxPurchaseForTargetProfit: solution(max),
  });
}

export interface RentalResult {
  model: "rental-fixed-rate-v1";
  name: string;
  loanPrincipal: number;
  acquisitionCosts: number;
  rehab: number;
  contingency: number;
  rehabWithContingency: number;
  stabilizationCosts: number;
  origination: number;
  financingFixed: number;
  stabilizationDebtPayments: number;
  cashInvested: number;
  allInUnleveredBasis: number;
  annualEffectiveIncome: number;
  annualOperatingCosts: number;
  annualNOI: number;
  annualCapexReserve: number;
  monthlyDebtPayment: number;
  annualDebtService: number;
  annualCashFlow: number;
  principalPaid: number;
  remainingLoanBalance: number;
  interestPaid: number;
  cashOnCash: number | null;
  capRateOnPurchase: number | null;
  allInUnleveredYield: number | null;
  debtServiceCoverage: number | null;
  breakEvenMonthlyRent: Solution;
  maxPurchaseForTargetYield: Solution;
}

function amortize(principal: number, annualRate: number, term: number, elapsed: number) {
  if (principal === 0) {
    return { payment: 0, balance: 0, principalPaid: 0, interestPaid: 0 };
  }
  const ratePerMonth = annualRate / 12;
  const elapsedMonths = Math.min(term, elapsed);
  const logarithm = Math.log1p(ratePerMonth);
  const payment =
    ratePerMonth === 0
      ? principal / term
      : (principal / term) * ((term * ratePerMonth) / -Math.expm1(-term * logarithm));
  const rawBalance =
    elapsedMonths === term
      ? 0
      : ratePerMonth === 0
        ? (principal * (term - elapsedMonths)) / term
        : (principal * -Math.expm1(-(term - elapsedMonths) * logarithm)) /
          -Math.expm1(-term * logarithm);
  const balance = Math.min(principal, Math.max(0, rawBalance));
  const principalPaid = principal - balance;
  return {
    payment,
    balance,
    principalPaid,
    interestPaid: Math.max(0, payment * elapsedMonths - principalPaid),
  };
}

export function evaluateRental(input: unknown): Result<RentalResult> {
  const parsed = read(input, "rental", rentalRules);
  if (parsed.status !== "ok") {
    return parsed;
  }
  const { name, n } = parsed.value;
  const financing = (input as RentalScenario).financing;
  if (financing !== "cash" && financing !== "amortizing") {
    return bad("financing", "Explicit cash or amortizing financing required");
  }
  if (
    financing === "cash" &&
    [
      n.loanToPurchase,
      n.annualInterestRate,
      n.originationRate,
      n.financingFixed,
      n.loanTermMonths,
    ].some((value) => value !== 0)
  ) {
    return bad(
      "financing",
      "Cash requires zero LTV, interest, origination, financing fees and loan term",
    );
  }
  if (financing === "amortizing" && n.loanTermMonths < 1) {
    return bad("inputs.loanTermMonths", "Amortizing loans require a positive term");
  }
  if (n.maintenanceRate + n.managementRate >= 1) {
    return bad("inputs.maintenanceRate", "Maintenance plus management rates must be less than 1");
  }
  const loanPrincipal = n.purchasePrice * n.loanToPurchase;
  const acquisitionCosts = n.acquisitionFixed + n.purchasePrice * n.acquisitionRate;
  const contingency = n.rehab * n.contingencyRate;
  const rehabWithContingency = n.rehab + contingency;
  const stabilizationCosts = n.stabilizationMonths * n.stabilizationMonthly;
  const loan = amortize(loanPrincipal, n.annualInterestRate, n.loanTermMonths, n.elapsedLoanMonths);
  const stabilizationDebtPayments =
    loan.payment * Math.min(n.stabilizationMonths, n.loanTermMonths);
  const origination = loanPrincipal * n.originationRate;
  const allInUnleveredBasis =
    n.purchasePrice + acquisitionCosts + rehabWithContingency + stabilizationCosts;
  const cashInvested =
    allInUnleveredBasis +
    origination +
    n.financingFixed +
    stabilizationDebtPayments -
    loanPrincipal;
  const annualEffectiveIncome = (n.monthlyRent + n.otherMonthlyIncome) * (1 - n.vacancyRate) * 12;
  const fixedMonthly = n.monthlyTaxes + n.monthlyInsurance + n.monthlyHoa + n.otherMonthlyOperating;
  const annualOperatingCosts =
    fixedMonthly * 12 + annualEffectiveIncome * (n.maintenanceRate + n.managementRate);
  const annualNOI = annualEffectiveIncome - annualOperatingCosts;
  // First twelve stabilized months; elapsedLoanMonths is a separate balance snapshot.
  const annualDebtService =
    loan.payment * Math.min(12, Math.max(0, n.loanTermMonths - n.stabilizationMonths));
  const annualCapexReserve = n.monthlyCapex * 12;
  const annualCashFlow = annualNOI - annualDebtService - annualCapexReserve;
  const incomeFactor = (1 - n.vacancyRate) * (1 - n.maintenanceRate - n.managementRate);
  const breakEvenMonthlyRent =
    incomeFactor === 0
      ? { status: "infeasible" as const, amount: null }
      : solution(
          Math.max(
            0,
            (fixedMonthly + n.monthlyCapex + annualDebtService / 12) / incomeFactor -
              n.otherMonthlyIncome,
          ),
        );
  // Unlevered NOI / all-in basis before capex; never cash-on-cash.
  const max =
    annualNOI <= 0
      ? -1
      : (annualNOI / n.targetAllInYield -
          n.acquisitionFixed -
          rehabWithContingency -
          stabilizationCosts) /
        (1 + n.acquisitionRate);
  return ok({
    model: "rental-fixed-rate-v1",
    name,
    loanPrincipal,
    acquisitionCosts,
    rehab: n.rehab,
    contingency,
    rehabWithContingency,
    stabilizationCosts,
    origination,
    financingFixed: n.financingFixed,
    stabilizationDebtPayments,
    cashInvested,
    allInUnleveredBasis,
    annualEffectiveIncome,
    annualOperatingCosts,
    annualNOI,
    annualCapexReserve,
    monthlyDebtPayment: loan.payment,
    annualDebtService,
    annualCashFlow,
    principalPaid: loan.principalPaid,
    remainingLoanBalance: loan.balance,
    interestPaid: loan.interestPaid,
    cashOnCash: ratio(annualCashFlow, cashInvested),
    capRateOnPurchase: ratio(annualNOI, n.purchasePrice),
    allInUnleveredYield: ratio(annualNOI, allInUnleveredBasis),
    debtServiceCoverage: ratio(annualNOI, annualDebtService),
    breakEvenMonthlyRent,
    maxPurchaseForTargetYield: solution(max),
  });
}

export interface SensitivityCase {
  name: string;
  overrides: Inputs<FlipField | RentalField>;
}
export interface SensitivityResult {
  name: string;
  scenario: Scenario;
  result: Result<FlipResult | RentalResult>;
}

export function sensitivity(base: unknown, cases: unknown): Result<SensitivityResult[]> {
  if (!record(base) || (base.kind !== "flip" && base.kind !== "rental") || !record(base.inputs)) {
    return bad("base", "Expected a supported scenario");
  }
  if (!Array.isArray(cases) || cases.length > 100) {
    return bad("cases", "Expected up to 100 named cases");
  }
  const rules = base.kind === "flip" ? flipRules : rentalRules;
  const result: SensitivityResult[] = [];
  const names = new Set<string>();
  for (const [index, entry] of cases.entries()) {
    if (
      !record(entry) ||
      !text(entry.name, 160) ||
      !record(entry.overrides) ||
      names.has(entry.name)
    ) {
      return bad(`cases.${index}`, "Unique name and override object required");
    }
    names.add(entry.name);
    for (const key of Object.keys(entry.overrides)) {
      if (!Object.hasOwn(rules, key)) {
        return bad(`cases.${index}.overrides`, "Unknown override field");
      }
    }
    let scenario: Scenario;
    try {
      const selected =
        base.kind === "flip"
          ? {
              kind: "flip" as const,
              name: entry.name,
              inputs: { ...base.inputs, ...entry.overrides },
            }
          : {
              kind: "rental" as const,
              name: entry.name,
              financing: base.financing,
              inputs: { ...base.inputs, ...entry.overrides },
            };
      scenario = structuredClone(selected) as Scenario;
    } catch {
      return bad(
        `cases.${index}`,
        "Scenario inputs must be cloneable data, not executable objects",
      );
    }
    result.push({
      name: entry.name,
      scenario,
      result: scenario.kind === "flip" ? evaluateFlip(scenario) : evaluateRental(scenario),
    });
  }
  return ok(result);
}
