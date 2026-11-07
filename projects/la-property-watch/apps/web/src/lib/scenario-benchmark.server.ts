import {
  type Assumption,
  type BlindState,
  benchmarkMetrics,
  blindCards,
  buildDataset,
  createBlindState,
  dateOnly,
  evaluateFlip,
  evaluateRental,
  mapIdentifierCsv,
  type Review,
  record,
  restoreBlindState,
  type Scenario,
  sensitivity,
} from "./decision-support/index.ts";
import { allowedEmails, canonicalPartnerEmail } from "./model.ts";

export class ScenarioBenchmarkValidationError extends Error {}
export class ScenarioBenchmarkConflictError extends Error {}

const MAX_STORED_JSON_BYTES = 400_000;
const MAX_COMPETITOR_CSV_BYTES = 60_000;
const MAX_COMPETITOR_ROWS = 1_000;
const MAX_CANDIDATE_REFERENCES = 25;

const commonMoneyFields = ["purchasePrice", "acquisitionFixed", "rehab", "financingFixed"] as const;
const flipMoneyFields = [
  ...commonMoneyFields,
  "holdingMonthly",
  "salePrice",
  "sellingFixed",
  "targetProfit",
] as const;
const rentalMoneyFields = [
  ...commonMoneyFields,
  "stabilizationMonthly",
  "monthlyRent",
  "otherMonthlyIncome",
  "monthlyTaxes",
  "monthlyInsurance",
  "monthlyHoa",
  "otherMonthlyOperating",
  "monthlyCapex",
] as const;
const flipFields = [
  "purchasePrice",
  "acquisitionFixed",
  "acquisitionRate",
  "rehab",
  "contingencyRate",
  "holdingMonths",
  "holdingMonthly",
  "loanToPurchase",
  "annualInterestRate",
  "originationRate",
  "financingFixed",
  "salePrice",
  "sellingRate",
  "sellingFixed",
  "targetProfit",
] as const;
const rentalFields = [
  "purchasePrice",
  "acquisitionFixed",
  "acquisitionRate",
  "rehab",
  "contingencyRate",
  "stabilizationMonths",
  "stabilizationMonthly",
  "loanToPurchase",
  "annualInterestRate",
  "originationRate",
  "financingFixed",
  "loanTermMonths",
  "elapsedLoanMonths",
  "monthlyRent",
  "otherMonthlyIncome",
  "vacancyRate",
  "monthlyTaxes",
  "monthlyInsurance",
  "monthlyHoa",
  "otherMonthlyOperating",
  "maintenanceRate",
  "managementRate",
  "monthlyCapex",
  "targetAllInYield",
] as const;

type ClientCell = { value: number | null; asOf: string | null };
type StoredCell =
  | { valueCents: number | null; asOf: string | null; provenance: "user-assumption" }
  | { value: number | null; asOf: string | null; provenance: "user-assumption" };
type CandidateSelection = {
  saleId: string;
  disposition: "selected_support" | "excluded";
  reason: string;
};
export type ScenarioWriteInput = {
  id: string | null;
  expectedVersion: number;
  name: string;
  kind: "flip" | "rental";
  financing: "cash" | "amortizing" | null;
  inputs: Record<string, ClientCell | null>;
  sensitivity: Array<{ name: string; overrides: Record<string, ClientCell | null> }>;
  candidateSelections: CandidateSelection[];
  candidateRemovals?: string[];
};

interface ScenarioRow {
  id: string;
  property_key: string;
  name: string;
  kind: "flip" | "rental";
  financing: "cash" | "amortizing" | null;
  currency: string;
  inputs_cents_json: string;
  sensitivity_cents_json: string;
  result_json: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}
interface SaleEvidence {
  schemaVersion: 1;
  candidateAddress: string | null;
  candidateParcelId: string;
  saleDate: string;
  salePriceCents: number;
  qualificationStatus: string;
  exclusionReason: string | null;
  selectionReason: string;
  sourceUrl: string;
}
interface CandidateRow {
  scenario_id: string;
  sale_id: string;
  disposition: CandidateSelection["disposition"];
  reason: string;
  evidence_snapshot_json: string | null;
  candidate_address: string | null;
  candidate_parcel_id: string | null;
  sale_date: string | null;
  sale_price_cents: number | null;
  qualification_status: string | null;
  exclusion_reason: string | null;
  selection_reason: string | null;
  source_url: string | null;
}

function saleEvidence(row: {
  candidate_address: string | null;
  candidate_parcel_id: string;
  sale_date: string;
  sale_price_cents: number;
  qualification_status: string;
  exclusion_reason: string | null;
  selection_reason: string;
  source_url: string;
}): SaleEvidence {
  return {
    schemaVersion: 1,
    candidateAddress: row.candidate_address,
    candidateParcelId: row.candidate_parcel_id,
    saleDate: row.sale_date,
    salePriceCents: row.sale_price_cents,
    qualificationStatus: row.qualification_status,
    exclusionReason: row.exclusion_reason,
    selectionReason: row.selection_reason,
    sourceUrl: row.source_url,
  };
}

function currentSaleEvidence(row: CandidateRow): SaleEvidence | null {
  if (
    row.candidate_parcel_id === null ||
    row.sale_date === null ||
    row.sale_price_cents === null ||
    row.qualification_status === null ||
    row.selection_reason === null ||
    row.source_url === null
  ) {
    return null;
  }
  return saleEvidence({
    candidate_address: row.candidate_address,
    candidate_parcel_id: row.candidate_parcel_id,
    sale_date: row.sale_date,
    sale_price_cents: row.sale_price_cents,
    qualification_status: row.qualification_status,
    exclusion_reason: row.exclusion_reason,
    selection_reason: row.selection_reason,
    source_url: row.source_url,
  });
}

function partnerEmail(value: string) {
  const canonical = canonicalPartnerEmail(value);
  if (!canonical) {
    throw new ScenarioBenchmarkValidationError("A configured partner identity is required.");
  }
  return canonical;
}
function plainText(value: unknown, label: string, max = 160) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new ScenarioBenchmarkValidationError(`${label} is invalid.`);
  }
  return value;
}
function propertyKey(value: string) {
  return plainText(value, "Property key", 300);
}
function jsonBytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
function boundedJson(value: unknown, label: string) {
  const serialized = JSON.stringify(value);
  if (jsonBytes(serialized) > MAX_STORED_JSON_BYTES) {
    throw new ScenarioBenchmarkValidationError(`${label} exceeds the persisted JSON limit.`);
  }
  return serialized;
}
function dollarsToCents(value: number, path: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new ScenarioBenchmarkValidationError(
      `${path} must be a finite USD amount from 0 to 1,000,000,000.`,
    );
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents / 100 - value) > 1e-9) {
    throw new ScenarioBenchmarkValidationError(
      `${path} must use USD dollars with at most two decimal places.`,
    );
  }
  return cents;
}
function storedCell(value: unknown, monetary: boolean, path: string): StoredCell {
  if (value === null || value === undefined) {
    return monetary
      ? { valueCents: null, asOf: null, provenance: "user-assumption" }
      : { value: null, asOf: null, provenance: "user-assumption" };
  }
  if (!record(value)) {
    throw new ScenarioBenchmarkValidationError(`${path} must be an assumption object or null.`);
  }
  const keys = Object.keys(value).toSorted();
  if (keys.length !== 2 || keys[0] !== "asOf" || keys[1] !== "value") {
    throw new ScenarioBenchmarkValidationError(
      `${path} accepts only value and asOf; clients cannot assert verified-record provenance.`,
    );
  }
  const amount = value["value"];
  const asOf = value["asOf"];
  if (amount === null) {
    if (asOf !== null) {
      throw new ScenarioBenchmarkValidationError(
        `${path}.asOf must be null while the value is unknown.`,
      );
    }
    return monetary
      ? { valueCents: null, asOf: null, provenance: "user-assumption" }
      : { value: null, asOf: null, provenance: "user-assumption" };
  }
  if (typeof amount !== "number" || !dateOnly(asOf)) {
    throw new ScenarioBenchmarkValidationError(
      `${path} requires a number and an explicit valid as-of date.`,
    );
  }
  return monetary
    ? { valueCents: dollarsToCents(amount, path), asOf, provenance: "user-assumption" }
    : { value: amount, asOf, provenance: "user-assumption" };
}
function normalizeInputs(
  kind: "flip" | "rental",
  input: unknown,
  path = "inputs",
): Record<string, StoredCell> {
  if (!record(input)) {
    throw new ScenarioBenchmarkValidationError(`${path} must be an object.`);
  }
  const fields = kind === "flip" ? flipFields : rentalFields;
  const allowed = new Set<string>(fields);
  const monetary = new Set<string>(kind === "flip" ? flipMoneyFields : rentalMoneyFields);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new ScenarioBenchmarkValidationError(`${path}.${key} is not supported.`);
    }
  }
  return Object.fromEntries(
    fields.map((field) => [
      field,
      storedCell(input[field], monetary.has(field), `${path}.${field}`),
    ]),
  );
}
function domainInputs(stored: Record<string, StoredCell>): Record<string, Assumption> {
  return Object.fromEntries(
    Object.entries(stored).map(([field, cell]) => {
      const value =
        "valueCents" in cell
          ? cell.valueCents === null
            ? null
            : cell.valueCents / 100
          : cell.value;
      return [field, { value, provenance: { kind: "user-assumption", asOf: cell.asOf } }];
    }),
  );
}
function evaluateStored(
  kind: "flip" | "rental",
  name: string,
  financing: "cash" | "amortizing" | null,
  inputs: Record<string, StoredCell>,
  sensitivityInput: Array<{ name: string; overrides: Record<string, StoredCell> }>,
) {
  const scenario = (
    kind === "flip"
      ? { kind, name, inputs: domainInputs(inputs) }
      : { kind, name, financing, inputs: domainInputs(inputs) }
  ) as Scenario;
  const evaluation = kind === "flip" ? evaluateFlip(scenario) : evaluateRental(scenario);
  const sensitivityEvaluation = sensitivity(
    scenario,
    sensitivityInput.map((entry) => ({
      name: entry.name,
      overrides: domainInputs(entry.overrides),
    })),
  );
  return {
    monetaryUnit: "USD dollars" as const,
    rateUnit: "decimal fraction" as const,
    annualRentalPeriod: "first 12 stabilized months" as const,
    elapsedLoanMonthsBoundary: "separate modeled-loan balance snapshot" as const,
    rentalMaximumOfferBoundary: "unlevered NOI / all-in basis before capex" as const,
    evaluation,
    sensitivity: sensitivityEvaluation,
    disclaimer:
      "Scenario analysis only; not an appraisal, investment recommendation, forecast, owner payoff, equity, or title claim.",
  };
}
function normalizeSensitivity(kind: "flip" | "rental", value: unknown) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new ScenarioBenchmarkValidationError("Sensitivity must contain at most 20 named cases.");
  }
  const names = new Set<string>();
  return value.map((entry, index) => {
    if (!record(entry)) {
      throw new ScenarioBenchmarkValidationError(`Sensitivity case ${index + 1} is invalid.`);
    }
    const name = plainText(entry["name"], `Sensitivity case ${index + 1} name`);
    if (names.has(name)) {
      throw new ScenarioBenchmarkValidationError("Sensitivity case names must be unique.");
    }
    names.add(name);
    if (!record(entry["overrides"])) {
      throw new ScenarioBenchmarkValidationError(`${name} overrides are invalid.`);
    }
    const fields = new Set<string>(kind === "flip" ? flipFields : rentalFields);
    const monetary = new Set<string>(kind === "flip" ? flipMoneyFields : rentalMoneyFields);
    const overrides: Record<string, StoredCell> = {};
    for (const [field, cell] of Object.entries(entry["overrides"])) {
      if (!fields.has(field)) {
        throw new ScenarioBenchmarkValidationError(`${name}.${field} is not supported.`);
      }
      overrides[field] = storedCell(cell, monetary.has(field), `sensitivity.${name}.${field}`);
    }
    return { name, overrides };
  });
}
function normalizeCandidates(value: unknown): CandidateSelection[] {
  if (!Array.isArray(value) || value.length > MAX_CANDIDATE_REFERENCES) {
    throw new ScenarioBenchmarkValidationError(
      `Select or exclude at most ${MAX_CANDIDATE_REFERENCES} sale candidates.`,
    );
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!record(entry)) {
      throw new ScenarioBenchmarkValidationError("Sale candidate selection is invalid.");
    }
    const saleId = plainText(entry["saleId"], "Sale candidate ID", 300);
    const disposition = entry["disposition"];
    if (disposition !== "selected_support" && disposition !== "excluded") {
      throw new ScenarioBenchmarkValidationError("Sale candidate disposition is invalid.");
    }
    const reason = plainText(entry["reason"], "Sale candidate reason", 1000);
    if (seen.has(saleId)) {
      throw new ScenarioBenchmarkValidationError("Sale candidates must be unique.");
    }
    seen.add(saleId);
    return { saleId, disposition, reason };
  });
}

function normalizeCandidateRemovals(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_CANDIDATE_REFERENCES) {
    throw new ScenarioBenchmarkValidationError(
      `Remove at most ${MAX_CANDIDATE_REFERENCES} sale candidate references.`,
    );
  }
  const removals = value.map((saleId) => plainText(saleId, "Removed sale candidate ID", 300));
  if (new Set(removals).size !== removals.length) {
    throw new ScenarioBenchmarkValidationError("Removed sale candidates must be unique.");
  }
  return removals;
}

export async function loadPropertyScenarios(db: D1Database, rawPropertyKey: string) {
  const key = propertyKey(rawPropertyKey);
  const [rows, candidates] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM property_deal_scenarios WHERE property_key=? ORDER BY updated_at DESC,id",
      )
      .bind(key)
      .all<ScenarioRow>(),
    db
      .prepare(`SELECT c.*,s.candidate_address,s.candidate_parcel_id,s.sale_date,s.sale_price_cents,s.qualification_status,s.exclusion_reason,s.selection_reason,s.source_url
      FROM property_deal_scenario_candidates c
      JOIN property_deal_scenarios scenario ON scenario.id=c.scenario_id
      LEFT JOIN property_sales s ON s.id=c.sale_id AND s.subject_property_key=scenario.property_key
      WHERE scenario.property_key=? ORDER BY c.scenario_id,c.disposition,COALESCE(s.sale_date,'' ) DESC,c.sale_id`)
      .bind(key)
      .all<CandidateRow>(),
  ]);
  return rows.results.map((row) => ({
    id: row.id,
    propertyKey: row.property_key,
    name: row.name,
    kind: row.kind,
    financing: row.financing,
    currency: row.currency,
    inputStorageUnit:
      "integer cents for money; native decimal fractions/month counts otherwise" as const,
    inputs: JSON.parse(row.inputs_cents_json) as unknown,
    sensitivity: JSON.parse(row.sensitivity_cents_json) as unknown,
    result: JSON.parse(row.result_json) as unknown,
    version: row.version,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    saleCandidateReferences: candidates.results
      .filter((entry) => entry.scenario_id === row.id)
      .map((entry) => {
        const savedEvidence = entry.evidence_snapshot_json
          ? (JSON.parse(entry.evidence_snapshot_json) as SaleEvidence)
          : null;
        const currentEvidence = currentSaleEvidence(entry);
        const currentSourceStatus = !currentEvidence
          ? ("missing" as const)
          : !savedEvidence
            ? ("unknown_legacy" as const)
            : JSON.stringify(currentEvidence) === JSON.stringify(savedEvidence)
              ? ("unchanged" as const)
              : currentEvidence.qualificationStatus.startsWith("excluded")
                ? ("changed_excluded" as const)
                : ("changed" as const);
        return {
          saleId: entry.sale_id,
          disposition: entry.disposition,
          reason: entry.reason,
          savedEvidenceStatus: savedEvidence ? ("captured" as const) : ("unknown_legacy" as const),
          savedEvidence,
          currentEvidence,
          currentSourceStatus,
          candidateAddress:
            savedEvidence?.candidateAddress ?? currentEvidence?.candidateAddress ?? null,
          candidateParcelId:
            savedEvidence?.candidateParcelId ??
            currentEvidence?.candidateParcelId ??
            "Unknown legacy",
          saleDate: savedEvidence?.saleDate ?? currentEvidence?.saleDate ?? null,
          salePriceCents: savedEvidence?.salePriceCents ?? currentEvidence?.salePriceCents ?? null,
          qualificationStatus:
            savedEvidence?.qualificationStatus ?? currentEvidence?.qualificationStatus ?? null,
          sourceUrl: savedEvidence?.sourceUrl ?? currentEvidence?.sourceUrl ?? null,
          boundary:
            "Saved supporting transfer evidence only; never a verified subject exit value or appraisal.",
        };
      }),
  }));
}

export async function upsertPropertyScenario(
  db: D1Database,
  actor: string,
  rawPropertyKey: string,
  input: ScenarioWriteInput,
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  const key = propertyKey(rawPropertyKey);
  if (!record(input)) {
    throw new ScenarioBenchmarkValidationError("Scenario request is invalid.");
  }
  const name = plainText(input.name, "Scenario name");
  if (input.kind !== "flip" && input.kind !== "rental") {
    throw new ScenarioBenchmarkValidationError("Scenario kind is invalid.");
  }
  if (input.kind === "flip" && input.financing !== null) {
    throw new ScenarioBenchmarkValidationError(
      "Flip financing is expressed by its explicit inputs, not a financing mode.",
    );
  }
  if (input.kind === "rental" && input.financing !== "cash" && input.financing !== "amortizing") {
    throw new ScenarioBenchmarkValidationError(
      "Rental financing must explicitly be cash or amortizing.",
    );
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new ScenarioBenchmarkValidationError("Scenario version is invalid.");
  }
  const requestedId = input.id === null ? null : plainText(input.id, "Scenario ID", 100);
  const existingScenario = requestedId
    ? await db
        .prepare("SELECT id,version FROM property_deal_scenarios WHERE id=? AND property_key=?")
        .bind(requestedId, key)
        .first<{ id: string; version: number }>()
    : null;
  if (requestedId && (!existingScenario || existingScenario.version !== input.expectedVersion)) {
    throw new ScenarioBenchmarkConflictError("Scenario changed; reload before saving.");
  }
  if (!requestedId) {
    const property = await db
      .prepare("SELECT property_key FROM watchlist_properties WHERE property_key=?")
      .bind(key)
      .first<{ property_key: string }>();
    if (!property) {
      throw new ScenarioBenchmarkValidationError(
        "New scenarios require a property in the current real-property watchlist.",
      );
    }
  }
  const inputs = normalizeInputs(input.kind, input.inputs);
  const sensitivityCases = normalizeSensitivity(input.kind, input.sensitivity);
  const candidateSelections = normalizeCandidates(input.candidateSelections);
  const candidateRemovals = normalizeCandidateRemovals(input.candidateRemovals);
  if (candidateSelections.some((entry) => candidateRemovals.includes(entry.saleId))) {
    throw new ScenarioBenchmarkValidationError(
      "A sale candidate cannot be selected and explicitly removed in the same revision.",
    );
  }
  const existingCandidates = requestedId
    ? await db
        .prepare(
          "SELECT sale_id,evidence_snapshot_json FROM property_deal_scenario_candidates WHERE scenario_id=?",
        )
        .bind(requestedId)
        .all<{ sale_id: string; evidence_snapshot_json: string | null }>()
    : { results: [] };
  const existingCandidateIds = new Set(existingCandidates.results.map((entry) => entry.sale_id));
  const candidateEvidence = new Map<string, SaleEvidence>();
  if (candidateSelections.length) {
    const saleIds = JSON.stringify(candidateSelections.map((entry) => entry.saleId));
    const found = await db
      .prepare(
        "SELECT * FROM property_sales WHERE subject_property_key=? AND id IN (SELECT value FROM json_each(?))",
      )
      .bind(key, saleIds)
      .all<{
        id: string;
        candidate_address: string | null;
        candidate_parcel_id: string;
        sale_date: string;
        sale_price_cents: number;
        qualification_status: string;
        exclusion_reason: string | null;
        selection_reason: string;
        source_url: string;
      }>();
    for (const sale of found.results) {
      candidateEvidence.set(sale.id, saleEvidence(sale));
    }
    if (
      candidateSelections.some(
        (entry) => !existingCandidateIds.has(entry.saleId) && !candidateEvidence.has(entry.saleId),
      )
    ) {
      throw new ScenarioBenchmarkValidationError(
        "Every sale reference must be a persisted official candidate for this subject property.",
      );
    }
  }
  const result = evaluateStored(input.kind, name, input.financing, inputs, sensitivityCases);
  const inputsJson = boundedJson(inputs, "Scenario inputs");
  const sensitivityJson = boundedJson(sensitivityCases, "Scenario sensitivity");
  const resultJson = boundedJson(result, "Scenario results");
  const timestamp = now.toISOString();
  const id = requestedId ?? crypto.randomUUID();
  const operationToken = crypto.randomUUID();
  if (input.id === null) {
    if (input.expectedVersion !== 0) {
      throw new ScenarioBenchmarkConflictError("New scenarios must start at version zero.");
    }
    await db.batch([
      db
        .prepare(`INSERT INTO property_deal_scenarios
        (id,property_key,name,kind,financing,currency,inputs_cents_json,sensitivity_cents_json,result_json,version,created_at,created_by,updated_at,updated_by,operation_token)
        VALUES (?,?,?,?,?,'USD',?,?,?,1,?,?,?,?,?)`)
        .bind(
          id,
          key,
          name,
          input.kind,
          input.financing,
          inputsJson,
          sensitivityJson,
          resultJson,
          timestamp,
          actorEmail,
          timestamp,
          actorEmail,
          operationToken,
        ),
      ...candidateSelections.map((entry) =>
        db
          .prepare(
            "INSERT INTO property_deal_scenario_candidates (scenario_id,sale_id,disposition,reason,evidence_snapshot_json,created_at,created_by) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            entry.saleId,
            entry.disposition,
            entry.reason,
            boundedJson(candidateEvidence.get(entry.saleId), "Sale evidence snapshot"),
            timestamp,
            actorEmail,
          ),
      ),
    ]);
  } else {
    await db.batch([
      db
        .prepare(
          `UPDATE property_deal_scenarios SET name=?,kind=?,financing=?,inputs_cents_json=?,sensitivity_cents_json=?,result_json=?,version=version+1,updated_at=?,updated_by=?,operation_token=? WHERE id=? AND property_key=? AND version=?`,
        )
        .bind(
          name,
          input.kind,
          input.financing,
          inputsJson,
          sensitivityJson,
          resultJson,
          timestamp,
          actorEmail,
          operationToken,
          id,
          key,
          input.expectedVersion,
        ),
      ...candidateRemovals.map((saleId) =>
        db
          .prepare(
            "DELETE FROM property_deal_scenario_candidates WHERE scenario_id=? AND sale_id=? AND EXISTS (SELECT 1 FROM property_deal_scenarios WHERE id=? AND operation_token=?)",
          )
          .bind(id, saleId, id, operationToken),
      ),
      ...candidateSelections.map((entry) =>
        db
          .prepare(
            `INSERT INTO property_deal_scenario_candidates (scenario_id,sale_id,disposition,reason,evidence_snapshot_json,created_at,created_by)
            SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM property_deal_scenarios WHERE id=? AND operation_token=?)
            ON CONFLICT(scenario_id,sale_id) DO UPDATE SET disposition=excluded.disposition,reason=excluded.reason,created_at=excluded.created_at,created_by=excluded.created_by`,
          )
          .bind(
            id,
            entry.saleId,
            entry.disposition,
            entry.reason,
            candidateEvidence.has(entry.saleId)
              ? boundedJson(candidateEvidence.get(entry.saleId), "Sale evidence snapshot")
              : null,
            timestamp,
            actorEmail,
            id,
            operationToken,
          ),
      ),
    ]);
    const updated = await db
      .prepare(
        "SELECT version FROM property_deal_scenarios WHERE id=? AND property_key=? AND operation_token=?",
      )
      .bind(id, key, operationToken)
      .first<{ version: number }>();
    if (!updated) {
      throw new ScenarioBenchmarkConflictError("Scenario changed; reload before saving.");
    }
  }
  return (await loadPropertyScenarios(db, key)).find((scenario) => scenario.id === id)!;
}

interface BuyBoxRow {
  id: string;
  name: string;
  property_types_json: string;
  jurisdictions_json: string;
  neighborhoods_json: string;
  zips_json: string;
  min_size_value: number | null;
  max_size_value: number | null;
  size_basis: string;
  min_value_cents: number | null;
  max_value_cents: number | null;
  value_basis: string;
  value_assumption_label: string | null;
  distress_phases_json: string;
  version: number;
}
interface BenchmarkRow {
  id: string;
  private_name: string;
  market: string;
  as_of_date: string;
  buy_box_id: string;
  buy_box_version: number;
  buy_box_fingerprint: string;
  buy_box_snapshot_json: string | null;
  identifier_scheme: string;
  identifier_pattern: string;
  mode: "live" | "test-only";
  private_state_json: string;
  private_counts_json: string;
  reviewer_ids_json: string;
  status: "reviewing" | "revealed";
  version: number;
  created_at: string;
  created_by: string;
  revealed_at: string | null;
  revealed_by: string | null;
}
interface BenchmarkReviewRow {
  benchmark_id: string;
  card_id: string;
  reviewer_email: string;
  useful: Review["useful"];
  correctness: Review["correctness"];
  research_seconds: number | null;
  reason: string;
  version: number;
  created_at: string;
  updated_at: string;
  operation_token: string;
}
interface BenchmarkImportRow {
  source_id: string;
  source_kind: string;
  private_label: string;
  private_file_name: string | null;
  private_mapping_json: string;
  private_counts_json: string;
}
export type BenchmarkCreateInput = {
  privateName: string;
  market: string;
  asOfDate: string;
  buyBoxId: string;
  propertyKeys: string[];
  competitorCsv: string;
  tokenHeader: string;
  competitorLabel: string;
  fileName: string;
  mode: "live" | "test-only";
  licenseAcknowledged: boolean;
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function benchmarkRule(market: string) {
  if (market !== "norfolk-va") {
    throw new ScenarioBenchmarkValidationError(
      "Blind comparison currently supports the server-controlled Norfolk exact tax-account scheme.",
    );
  }
  return { scheme: "tax-account", pattern: "[0-9]{8}" } as const;
}
function cryptoRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4_294_967_296;
}
function reviewsFromRows(rows: BenchmarkReviewRow[]): Review[] {
  return rows.map((row) => ({
    cardId: row.card_id,
    reviewerId: row.reviewer_email,
    useful: row.useful,
    correctness: row.correctness,
    researchSeconds: row.research_seconds,
    reason: row.reason,
  }));
}

function completeReviewCoverage(
  reviewerIds: string[],
  cardIds: string[],
  rows: BenchmarkReviewRow[],
) {
  if (reviewerIds.length === 0 || cardIds.length === 0) {
    return false;
  }
  const covered = new Set(
    rows.map((row) => `${row.reviewer_email.toLowerCase()}\u0000${row.card_id}`),
  );
  return reviewerIds.every((reviewerId) =>
    cardIds.every((cardId) => covered.has(`${reviewerId.toLowerCase()}\u0000${cardId}`)),
  );
}

export async function createBlindBenchmark(
  db: D1Database,
  actor: string,
  input: BenchmarkCreateInput,
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  if (!record(input)) {
    throw new ScenarioBenchmarkValidationError("Benchmark request is invalid.");
  }
  const privateName = plainText(input.privateName, "Private benchmark name");
  const market = plainText(input.market, "Market", 64);
  if (!dateOnly(input.asOfDate)) {
    throw new ScenarioBenchmarkValidationError("Benchmark as-of date is invalid.");
  }
  const buyBoxId = plainText(input.buyBoxId, "Buy box ID", 100);
  const competitorLabel = plainText(input.competitorLabel, "Licensed source label", 200);
  const fileName = plainText(input.fileName, "Licensed export file name", 200);
  const tokenHeader = plainText(input.tokenHeader, "Identifier column", 200);
  if (input.licenseAcknowledged !== true) {
    throw new ScenarioBenchmarkValidationError(
      "Confirm that the competitor CSV is a user-owned licensed export.",
    );
  }
  if (input.mode !== "live" && input.mode !== "test-only") {
    throw new ScenarioBenchmarkValidationError("Benchmark mode is invalid.");
  }
  if (
    !Array.isArray(input.propertyKeys) ||
    input.propertyKeys.length < 1 ||
    input.propertyKeys.length > 100 ||
    input.propertyKeys.some((key) => typeof key !== "string")
  ) {
    throw new ScenarioBenchmarkValidationError("Select 1 to 100 current shortlist properties.");
  }
  const selectedKeys = [...new Set(input.propertyKeys.map(propertyKey))];
  if (selectedKeys.length !== input.propertyKeys.length) {
    throw new ScenarioBenchmarkValidationError("Selected shortlist properties must be unique.");
  }
  if (
    typeof input.competitorCsv !== "string" ||
    jsonBytes(input.competitorCsv) > MAX_COMPETITOR_CSV_BYTES
  ) {
    throw new ScenarioBenchmarkValidationError(
      `Licensed CSV must not exceed ${MAX_COMPETITOR_CSV_BYTES} UTF-8 bytes.`,
    );
  }
  const rule = benchmarkRule(market);
  const [buyBox, properties] = await Promise.all([
    db.prepare("SELECT * FROM buy_boxes WHERE id=?").bind(buyBoxId).first<BuyBoxRow>(),
    db
      .prepare(
        "SELECT property_key,jurisdiction_id,parcel_id FROM watchlist_properties WHERE property_key IN (SELECT value FROM json_each(?)) ORDER BY property_key",
      )
      .bind(JSON.stringify(selectedKeys))
      .all<{ property_key: string; jurisdiction_id: string; parcel_id: string | null }>(),
  ]);
  if (!buyBox) {
    throw new ScenarioBenchmarkValidationError("Selected buy box no longer exists.");
  }
  if (
    properties.results.length !== selectedKeys.length ||
    properties.results.some((entry) => entry.jurisdiction_id !== market || !entry.parcel_id)
  ) {
    throw new ScenarioBenchmarkValidationError(
      "Every selected item must be a current property in the same market with an exact official identifier.",
    );
  }
  const buyBoxSnapshot = {
    schemaVersion: 1 as const,
    propertyTypes: JSON.parse(buyBox.property_types_json),
    jurisdictions: JSON.parse(buyBox.jurisdictions_json),
    neighborhoods: JSON.parse(buyBox.neighborhoods_json),
    zips: JSON.parse(buyBox.zips_json),
    minSizeValue: buyBox.min_size_value,
    maxSizeValue: buyBox.max_size_value,
    sizeBasis: buyBox.size_basis,
    minValueCents: buyBox.min_value_cents,
    maxValueCents: buyBox.max_value_cents,
    valueBasis: buyBox.value_basis,
    valueAssumptionLabel: buyBox.value_assumption_label,
    distressPhases: JSON.parse(buyBox.distress_phases_json),
  };
  const fingerprint = `sha256:${await sha256(
    JSON.stringify({ id: buyBox.id, version: buyBox.version, criteria: buyBoxSnapshot }),
  )}`;
  const setup = { market, asOf: input.asOfDate, buybox: fingerprint, mode: input.mode } as const;
  const mapped = mapIdentifierCsv(
    input.competitorCsv,
    { market: { constant: market }, scheme: { constant: rule.scheme }, token: tokenHeader },
    {
      maxChars: MAX_COMPETITOR_CSV_BYTES,
      maxRows: MAX_COMPETITOR_ROWS,
      maxColumns: 50,
      maxCellChars: 512,
    },
  );
  if (mapped.status !== "ok") {
    throw new ScenarioBenchmarkValidationError(
      mapped.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  const sourceProvenance =
    input.mode === "live"
      ? (["selected-shortlist", "licensed-user-export"] as const)
      : (["test-fixture", "test-fixture"] as const);
  const sources = [
    {
      id: "internal-selected",
      label: "Property Watch selected shortlist",
      context: setup,
      provenance: sourceProvenance[0],
      rows: properties.results.map((entry) => ({
        market,
        scheme: rule.scheme,
        token: entry.parcel_id,
      })),
    },
    {
      id: "licensed-export",
      label: competitorLabel,
      context: setup,
      provenance: sourceProvenance[1],
      rows: mapped.value,
    },
  ];
  const dataset = buildDataset(setup, sources, [
    { market, scheme: rule.scheme, pattern: rule.pattern },
  ]);
  if (dataset.status !== "ok") {
    throw new ScenarioBenchmarkValidationError(
      dataset.issues.map((issue) => issue.message).join("; "),
    );
  }
  const state = createBlindState(dataset.value, cryptoRandom);
  if (state.status !== "ok") {
    throw new ScenarioBenchmarkValidationError(
      state.issues.map((issue) => issue.message).join("; "),
    );
  }
  const privateStateJson = boundedJson(state.value, "Private blind order");
  const privateCounts = {
    dataset: dataset.value.counts,
    sources: dataset.value.sources,
    quarantine: dataset.value.quarantine,
  };
  const reviewerIds = allowedEmails.filter(
    (email) => email.toLowerCase() !== actorEmail.toLowerCase(),
  );
  if (reviewerIds.length < 1) {
    throw new ScenarioBenchmarkValidationError(
      "An independent configured partner reviewer is required.",
    );
  }
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  await db.batch([
    db
      .prepare(`INSERT INTO blind_benchmarks
      (id,private_name,market,as_of_date,buy_box_id,buy_box_version,buy_box_fingerprint,buy_box_snapshot_json,identifier_scheme,identifier_pattern,mode,private_state_json,private_counts_json,reviewer_ids_json,status,version,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'reviewing',1,?,?)`)
      .bind(
        id,
        privateName,
        market,
        input.asOfDate,
        buyBoxId,
        buyBox.version,
        fingerprint,
        boundedJson(buyBoxSnapshot, "Frozen buy-box criteria"),
        rule.scheme,
        rule.pattern,
        input.mode,
        privateStateJson,
        boundedJson(privateCounts, "Private import accounting"),
        JSON.stringify(reviewerIds),
        timestamp,
        actorEmail,
      ),
    db
      .prepare(`INSERT INTO blind_benchmark_imports
      (id,benchmark_id,source_id,source_kind,private_label,private_file_name,private_mapping_json,private_raw_csv,private_counts_json,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        id,
        "internal-selected",
        "selected-shortlist",
        "Property Watch selected shortlist",
        null,
        JSON.stringify({ market, scheme: rule.scheme, propertyKeys: selectedKeys }),
        JSON.stringify(dataset.value.sources[0]),
        timestamp,
        actorEmail,
      ),
    db
      .prepare(`INSERT INTO blind_benchmark_imports
      (id,benchmark_id,source_id,source_kind,private_label,private_file_name,private_mapping_json,private_raw_csv,private_counts_json,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        id,
        "licensed-export",
        "licensed-user-export",
        competitorLabel,
        fileName,
        JSON.stringify({
          tokenHeader,
          market,
          scheme: rule.scheme,
          licenseAcknowledged: true,
        }),
        JSON.stringify(dataset.value.sources[1]),
        timestamp,
        actorEmail,
      ),
  ]);
  return loadBlindBenchmark(db, actorEmail, id);
}

async function benchmarkRows(db: D1Database, id: string) {
  const [benchmark, reviews, imports] = await Promise.all([
    db.prepare("SELECT * FROM blind_benchmarks WHERE id=?").bind(id).first<BenchmarkRow>(),
    db
      .prepare(
        "SELECT * FROM blind_benchmark_reviews WHERE benchmark_id=? ORDER BY reviewer_email,card_id",
      )
      .bind(id)
      .all<BenchmarkReviewRow>(),
    db
      .prepare(
        "SELECT source_id,source_kind,private_label,private_file_name,private_mapping_json,private_counts_json FROM blind_benchmark_imports WHERE benchmark_id=? ORDER BY source_kind DESC,source_id",
      )
      .bind(id)
      .all<BenchmarkImportRow>(),
  ]);
  if (!benchmark) {
    throw new ScenarioBenchmarkValidationError("Blind benchmark was not found.");
  }
  return { benchmark, reviews: reviews.results, imports: imports.results };
}

export async function loadBlindBenchmark(db: D1Database, actor: string, rawId: string) {
  const actorEmail = partnerEmail(actor);
  const id = plainText(rawId, "Benchmark ID", 100);
  const { benchmark, reviews, imports } = await benchmarkRows(db, id);
  const reviewerIds = JSON.parse(benchmark.reviewer_ids_json) as string[];
  const restored = restoreBlindState(JSON.parse(benchmark.private_state_json));
  if (restored.status !== "ok") {
    throw new Error("Persisted blind benchmark state failed validation.");
  }
  const cards = blindCards(restored.value);
  if (cards.status !== "ok") {
    throw new Error("Persisted blind benchmark cards failed validation.");
  }
  const cardIds = new Set(cards.value.map((card) => card.cardId));
  const assignedReviewers = new Set(reviewerIds.map((reviewerId) => reviewerId.toLowerCase()));
  const validReviews = reviews.filter(
    (review) =>
      cardIds.has(review.card_id) && assignedReviewers.has(review.reviewer_email.toLowerCase()),
  );
  const revealed = benchmark.status === "revealed";
  const metrics = benchmarkMetrics(restored.value, reviewsFromRows(validReviews), {
    reveal: revealed,
    reviewerIds,
  });
  if (metrics.status !== "ok") {
    throw new Error("Persisted blind benchmark reviews failed validation.");
  }
  const ownReviews = validReviews
    .filter((review) => review.reviewer_email.toLowerCase() === actorEmail.toLowerCase())
    .map((review) => ({
      cardId: review.card_id,
      useful: review.useful,
      correctness: review.correctness,
      researchSeconds: review.research_seconds,
      reason: review.reason,
      version: review.version,
      updatedAt: review.updated_at,
    }));
  return {
    id: benchmark.id,
    displayName: revealed ? benchmark.private_name : `Blind comparison · ${benchmark.as_of_date}`,
    market: benchmark.market,
    asOfDate: benchmark.as_of_date,
    buyBoxFingerprint: benchmark.buy_box_fingerprint,
    buyBoxVersion: benchmark.buy_box_version,
    frozenCriteriaStatus: benchmark.buy_box_snapshot_json
      ? ("captured" as const)
      : ("unknown_legacy" as const),
    frozenCriteria: benchmark.buy_box_snapshot_json
      ? (JSON.parse(benchmark.buy_box_snapshot_json) as {
          schemaVersion: 1;
          propertyTypes: string[];
          jurisdictions: string[];
          neighborhoods: string[];
          zips: string[];
          minSizeValue: number | null;
          maxSizeValue: number | null;
          sizeBasis: string;
          minValueCents: number | null;
          maxValueCents: number | null;
          valueBasis: string;
          valueAssumptionLabel: string | null;
          distressPhases: string[];
        })
      : null,
    identifierScheme: benchmark.identifier_scheme,
    status: benchmark.status,
    version: benchmark.version,
    role:
      benchmark.created_by.toLowerCase() === actorEmail.toLowerCase()
        ? ("setup_creator" as const)
        : reviewerIds.some((email) => email.toLowerCase() === actorEmail.toLowerCase())
          ? ("independent_reviewer" as const)
          : ("observer" as const),
    canReview:
      !revealed && reviewerIds.some((email) => email.toLowerCase() === actorEmail.toLowerCase()),
    canReveal:
      !revealed &&
      benchmark.created_by.toLowerCase() === actorEmail.toLowerCase() &&
      completeReviewCoverage(reviewerIds, [...cardIds], validReviews),
    cards: cards.value,
    ownReviews,
    metrics: metrics.value,
    reveal: revealed
      ? {
          privateName: benchmark.private_name,
          revealedAt: benchmark.revealed_at,
          revealedBy: benchmark.revealed_by,
          imports: imports.map((entry) => ({
            sourceKind: entry.source_kind,
            label: entry.private_label,
            fileName: entry.private_file_name,
            mapping: JSON.parse(entry.private_mapping_json) as unknown,
            counts: JSON.parse(entry.private_counts_json) as unknown,
          })),
        }
      : null,
    blindingLimitations: [
      "Neutral official identifiers permit evidence checking but can allow property recognition.",
      "Coverage patterns and external public-record navigation can weaken blinding.",
      "The setup creator is separate from every assigned reviewer; every assigned reviewer is expected to review every card.",
      "Held-out benchmark reviews never enter feedback-based ranking adjustments.",
    ],
  };
}

export async function listBlindBenchmarks(db: D1Database, actor: string) {
  const actorEmail = partnerEmail(actor);
  const rows = await db
    .prepare("SELECT id FROM blind_benchmarks ORDER BY created_at DESC,id")
    .all<{ id: string }>();
  return Promise.all(rows.results.map((row) => loadBlindBenchmark(db, actorEmail, row.id)));
}

export async function upsertBlindReview(
  db: D1Database,
  actor: string,
  rawId: string,
  input: {
    cardId: string;
    expectedVersion: number;
    useful: Review["useful"];
    correctness: Review["correctness"];
    researchSeconds: number | null;
    reason: string;
  },
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  const id = plainText(rawId, "Benchmark ID", 100);
  if (!record(input)) {
    throw new ScenarioBenchmarkValidationError("Blind review is invalid.");
  }
  const { benchmark } = await benchmarkRows(db, id);
  if (benchmark.status !== "reviewing") {
    throw new ScenarioBenchmarkValidationError("Reviews are closed after reveal.");
  }
  const reviewerIds = JSON.parse(benchmark.reviewer_ids_json) as string[];
  if (!reviewerIds.some((email) => email.toLowerCase() === actorEmail.toLowerCase())) {
    throw new ScenarioBenchmarkValidationError(
      "The setup creator cannot review this blind comparison.",
    );
  }
  const state = JSON.parse(benchmark.private_state_json) as BlindState;
  const cards = new Set(state.cards.map((card) => card.cardId));
  const cardId = plainText(input.cardId, "Blind card ID", 100);
  if (!cards.has(cardId)) {
    throw new ScenarioBenchmarkValidationError("Blind card is invalid.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new ScenarioBenchmarkValidationError("Review version is invalid.");
  }
  if (
    !(["yes", "no", "unknown"] as unknown[]).includes(input.useful) ||
    !(["yes", "no", "unknown"] as unknown[]).includes(input.correctness)
  ) {
    throw new ScenarioBenchmarkValidationError("Review judgments are invalid.");
  }
  if (
    input.researchSeconds !== null &&
    (!Number.isInteger(input.researchSeconds) ||
      input.researchSeconds < 0 ||
      input.researchSeconds > 604_800)
  ) {
    throw new ScenarioBenchmarkValidationError(
      "Research seconds must be null or a whole number from 0 to 604800.",
    );
  }
  const reason = plainText(input.reason, "Review reason", 2000);
  const timestamp = now.toISOString();
  const existing = await db
    .prepare(
      "SELECT version FROM blind_benchmark_reviews WHERE benchmark_id=? AND card_id=? AND reviewer_email=? COLLATE NOCASE",
    )
    .bind(id, cardId, actorEmail)
    .first<{ version: number }>();
  const nextVersion = (existing?.version ?? 0) + 1;
  if ((existing?.version ?? 0) !== input.expectedVersion) {
    throw new ScenarioBenchmarkConflictError("Blind review changed; reload before saving.");
  }
  const operationToken = crypto.randomUUID();
  const mutation = existing
    ? db
        .prepare(
          `UPDATE blind_benchmark_reviews
          SET useful=?,correctness=?,research_seconds=?,reason=?,version=?,updated_at=?,operation_token=?
          WHERE benchmark_id=? AND card_id=? AND reviewer_email=? COLLATE NOCASE AND version=?
          AND EXISTS (SELECT 1 FROM blind_benchmarks parent WHERE parent.id=? AND parent.status='reviewing')`,
        )
        .bind(
          input.useful,
          input.correctness,
          input.researchSeconds,
          reason,
          nextVersion,
          timestamp,
          operationToken,
          id,
          cardId,
          actorEmail,
          input.expectedVersion,
          id,
        )
    : db
        .prepare(
          `INSERT INTO blind_benchmark_reviews
          (benchmark_id,card_id,reviewer_email,useful,correctness,research_seconds,reason,version,created_at,updated_at,operation_token)
          SELECT ?,?,?,?,?,?,?,1,?,?,?
          WHERE EXISTS (SELECT 1 FROM blind_benchmarks parent WHERE parent.id=? AND parent.status='reviewing')
          AND NOT EXISTS (SELECT 1 FROM blind_benchmark_reviews existing WHERE existing.benchmark_id=? AND existing.card_id=? AND existing.reviewer_email=? COLLATE NOCASE)`,
        )
        .bind(
          id,
          cardId,
          actorEmail,
          input.useful,
          input.correctness,
          input.researchSeconds,
          reason,
          timestamp,
          timestamp,
          operationToken,
          id,
          id,
          cardId,
          actorEmail,
        );
  const audit = db
    .prepare(
      `INSERT INTO blind_benchmark_review_audit
      (id,benchmark_id,card_id,reviewer_email,useful,correctness,research_seconds,reason,version,created_at,operation_token)
      SELECT ?,benchmark_id,card_id,reviewer_email,useful,correctness,research_seconds,reason,version,?,?
      FROM blind_benchmark_reviews
      WHERE benchmark_id=? AND card_id=? AND reviewer_email=? COLLATE NOCASE AND operation_token=?`,
    )
    .bind(crypto.randomUUID(), timestamp, operationToken, id, cardId, actorEmail, operationToken);
  const [mutationResult, auditResult] = await db.batch([mutation, audit]);
  if (mutationResult?.meta.changes !== 1 || auditResult?.meta.changes !== 1) {
    const parent = await db
      .prepare("SELECT status FROM blind_benchmarks WHERE id=?")
      .bind(id)
      .first<{ status: string }>();
    if (parent?.status !== "reviewing") {
      throw new ScenarioBenchmarkValidationError("Reviews are closed after reveal.");
    }
    throw new ScenarioBenchmarkConflictError("Blind review changed; reload before saving.");
  }
  return loadBlindBenchmark(db, actorEmail, id);
}

export async function revealBlindBenchmark(
  db: D1Database,
  actor: string,
  rawId: string,
  input: { expectedVersion: number; confirmation: string },
  now = new Date(),
) {
  const actorEmail = partnerEmail(actor);
  const id = plainText(rawId, "Benchmark ID", 100);
  if (
    !record(input) ||
    input.confirmation !== "REVEAL SOURCES" ||
    !Number.isInteger(input.expectedVersion)
  ) {
    throw new ScenarioBenchmarkValidationError(
      'Type the exact irreversible confirmation "REVEAL SOURCES".',
    );
  }
  const result = await db
    .prepare(
      `UPDATE blind_benchmarks
      SET status='revealed',version=version+1,revealed_at=?,revealed_by=?,reveal_confirmation=?
      WHERE id=? AND created_by=? COLLATE NOCASE AND status='reviewing' AND version=?
      AND json_array_length(reviewer_ids_json)>0
      AND json_array_length(private_state_json,'$.cards')>0
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(blind_benchmarks.reviewer_ids_json) assigned
        CROSS JOIN json_each(blind_benchmarks.private_state_json,'$.cards') card
        WHERE NOT EXISTS (
          SELECT 1 FROM blind_benchmark_reviews review
          WHERE review.benchmark_id=blind_benchmarks.id
          AND review.reviewer_email=assigned.value COLLATE NOCASE
          AND review.card_id=json_extract(card.value,'$.cardId')
        )
      )`,
    )
    .bind(now.toISOString(), actorEmail, input.confirmation, id, actorEmail, input.expectedVersion)
    .run();
  if (!result.meta.changes) {
    const current = await db
      .prepare("SELECT status,version,created_by FROM blind_benchmarks WHERE id=?")
      .bind(id)
      .first<{ status: string; version: number; created_by: string }>();
    if (
      current?.status === "reviewing" &&
      current.version === input.expectedVersion &&
      current.created_by.toLowerCase() === actorEmail.toLowerCase()
    ) {
      throw new ScenarioBenchmarkValidationError(
        "Every assigned reviewer must review every blind card before sources can be revealed.",
      );
    }
    throw new ScenarioBenchmarkConflictError(
      "Benchmark changed, was already revealed, or this partner is not its setup creator.",
    );
  }
  return loadBlindBenchmark(db, actorEmail, id);
}

function csvCell(value: unknown) {
  const textValue = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(textValue) ? `'${textValue}` : textValue;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function revealedBenchmarkCsv(db: D1Database, actor: string, rawId: string) {
  const benchmark = await loadBlindBenchmark(db, actor, rawId);
  if (benchmark.status !== "revealed" || !benchmark.reveal || !benchmark.metrics.sources) {
    throw new ScenarioBenchmarkValidationError(
      "Source-specific export is unavailable before irreversible reveal.",
    );
  }
  const header = [
    "benchmark_id",
    "mode",
    "classification",
    "source",
    "eligible_properties",
    "review_judgments",
    "missing_judgments",
    "useful_yes",
    "useful_no",
    "useful_unknown",
    "useful_known_ratio",
    "correctness_yes",
    "correctness_no",
    "correctness_unknown",
    "correctness_known_ratio",
    "known_research_seconds",
    "seconds_per_timed_useful_property",
    "interpretation",
  ];
  const rows = benchmark.metrics.sources.map((source) => [
    benchmark.id,
    benchmark.metrics.mode,
    benchmark.metrics.mode === "test-only"
      ? "TEST-ONLY / SYNTHETIC TEST FIXTURE — NO COMPETITOR PERFORMANCE CLAIM"
      : "LIVE USER-LICENSED SOURCE / DESCRIPTIVE ONLY",
    source.label,
    source.metrics.eligibleProperties,
    source.metrics.reviewJudgments,
    source.metrics.missingJudgments,
    source.metrics.useful.yes,
    source.metrics.useful.no,
    source.metrics.useful.unknown,
    source.metrics.useful.yesKnownRatio,
    source.metrics.correctness.yes,
    source.metrics.correctness.no,
    source.metrics.correctness.unknown,
    source.metrics.correctness.yesKnownRatio,
    source.metrics.time.knownSeconds,
    source.metrics.time.secondsPerTimedUsefulProperty,
    "descriptive-only; no statistical significance or superiority claim",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
