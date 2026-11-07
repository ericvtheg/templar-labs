import type { IdentifierRow } from "./csv.ts";
import { bad, dateOnly, finite, ok, type Result, ratio, record, text } from "./validation.ts";

const literal = (value: unknown) =>
  value === null || value === undefined
    ? null
    : typeof value === "string" && value.length <= 256
      ? value
      : false;

export interface BenchmarkSetup {
  market: string;
  asOf: string;
  buybox: string;
  mode: "test-only" | "live";
}
export interface IdentifierRule {
  market: string;
  scheme: string;
  pattern: string;
}
export interface PropertyIdentifier {
  market: string;
  scheme: string;
  token: string;
}
export type SourceProvenance = "selected-shortlist" | "licensed-user-export" | "test-fixture";
export interface SourceInput {
  id: string;
  label: string;
  context: BenchmarkSetup;
  provenance: SourceProvenance;
  rows: (IdentifierRow | null)[];
}
export interface DatasetInput {
  setup: BenchmarkSetup;
  sources: SourceInput[];
  rules: IdentifierRule[];
}
export interface SourceCounts {
  id: string;
  label: string;
  rawRows: number;
  validRows: number;
  uncertainRows: number;
  duplicateRows: number;
  uniqueProperties: number;
  exclusiveProperties: number;
}
export interface DatasetCounts {
  rawRows: number;
  validRows: number;
  uncertainRows: number;
  duplicateRows: number;
  uniqueProperties: number;
  overlapProperties: number;
}
export interface DatasetProperty {
  key: string;
  identifier: PropertyIdentifier;
  sourceIds: string[];
}
export interface QuarantinedRow {
  sourceId: string;
  rowIndex: number;
  reason:
    | "missing-identifier"
    | "invalid-identifier"
    | "market-mismatch"
    | "unknown-scheme"
    | "invalid-row";
}
/** SERVER-PRIVATE. Never serialize Dataset or BlindState in a reviewer response. */
export interface Dataset {
  input: DatasetInput;
  properties: DatasetProperty[];
  sources: SourceCounts[];
  counts: DatasetCounts;
  quarantine: QuarantinedRow[];
}
export interface BlindState {
  version: 1;
  input: DatasetInput;
  cards: { cardId: string; propertyKey: string }[];
}
export interface BlindCard {
  cardId: string;
  identifier: PropertyIdentifier;
}
export const BENCHMARK_LIMITS = {
  sources: 20,
  rowsPerSource: 50_000,
  totalRows: 100_000,
  rules: 50,
  reviewers: 100,
  reviews: 100_000,
} as const;
export const BLIND_IDENTIFIER_SCHEMES = ["parcel", "tax-account", "apn", "bbl", "pin"] as const;

function setupValue(value: unknown): BenchmarkSetup | null {
  if (
    !record(value) ||
    !text(value.market, 64) ||
    !dateOnly(value.asOf) ||
    !text(value.buybox, 200) ||
    (value.mode !== "test-only" && value.mode !== "live")
  ) {
    return null;
  }
  return { market: value.market, asOf: value.asOf, buybox: value.buybox, mode: value.mode };
}
const sameContext = (left: BenchmarkSetup, right: BenchmarkSetup) =>
  left.market === right.market &&
  left.asOf === right.asOf &&
  left.buybox === right.buybox &&
  left.mode === right.mode;
const keyOf = (identifier: PropertyIdentifier) =>
  JSON.stringify([identifier.market, identifier.scheme, identifier.token]);
const ruleKey = (market: string, scheme: string) => JSON.stringify([market, scheme]);

function compileRule(pattern: unknown): RegExp | null {
  if (typeof pattern !== "string" || pattern.length > 120) {
    return null;
  }
  const match = /^\[([A-Za-z0-9_.-]+)\]\{([0-9]{1,3})(?:,([0-9]{1,3}))?\}$/.exec(pattern);
  if (!match || match[0] !== pattern) {
    return null;
  }
  const min = Number(match[2]);
  const max = Number(match[3] ?? match[2]);
  if (min < 1 || max < min || max > 128) {
    return null;
  }
  const body = match[1]!;
  const characters = new Set<string>();
  for (let index = 0; index < body.length; index++) {
    const character = body[index]!;
    if (character === "-") {
      if (index !== 0 && index !== body.length - 1) {
        return null;
      }
      characters.add(character);
      continue;
    }
    if (body[index + 1] === "-" && index + 2 < body.length) {
      const range = body.slice(index, index + 3);
      if (!["A-Z", "a-z", "0-9"].includes(range)) {
        return null;
      }
      for (let code = character.charCodeAt(0); code <= body[index + 2]!.charCodeAt(0); code++) {
        characters.add(String.fromCharCode(code));
      }
      index += 2;
    } else {
      characters.add(character);
    }
  }
  const safeClass = [...characters]
    .map((character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");
  return new RegExp(`^[${safeClass}]{${min},${max}}$`, "u");
}

export function buildDataset(setup: unknown, sources: unknown, rules: unknown): Result<Dataset> {
  const context = setupValue(setup);
  if (!context) {
    return bad("setup", "Exact market, valid date, buybox identity and mode required");
  }
  if (!Array.isArray(sources) || sources.length > BENCHMARK_LIMITS.sources) {
    return bad("sources", "Source array exceeds limit");
  }
  if (!Array.isArray(rules) || !rules.length || rules.length > BENCHMARK_LIMITS.rules) {
    return bad("rules", "Explicit identifier rules required");
  }
  const patterns = new Map<string, RegExp>();
  const safeRules: IdentifierRule[] = [];
  for (const rule of rules) {
    if (!record(rule) || rule.market !== context.market || !text(rule.scheme, 64)) {
      return bad("rules", "Rule market must match setup, with exact scheme");
    }
    const regex = compileRule(rule.pattern);
    const key = ruleKey(context.market, rule.scheme);
    if (!regex || patterns.has(key)) {
      return bad("rules", "Unique scheme and safe character-class length rule required");
    }
    patterns.set(key, regex);
    safeRules.push({
      market: context.market,
      scheme: rule.scheme,
      pattern: rule.pattern as string,
    });
  }
  const sourceIds = new Set<string>();
  const safeSources: SourceInput[] = [];
  const summaries: SourceCounts[] = [];
  const properties = new Map<string, DatasetProperty>();
  const quarantine: QuarantinedRow[] = [];
  const counts: DatasetCounts = {
    rawRows: 0,
    validRows: 0,
    uncertainRows: 0,
    duplicateRows: 0,
    uniqueProperties: 0,
    overlapProperties: 0,
  };
  for (const source of sources) {
    if (
      !record(source) ||
      !text(source.id, 128) ||
      !text(source.label, 200) ||
      sourceIds.has(source.id)
    ) {
      return bad("source", "Unique source id and label required");
    }
    const sourceContext = setupValue(source.context);
    if (!sourceContext || !sameContext(context, sourceContext)) {
      return bad("source.context", "Market/date/buybox/mode must exactly match");
    }
    if (
      !["selected-shortlist", "licensed-user-export", "test-fixture"].includes(
        source.provenance as string,
      ) ||
      (context.mode === "live" && source.provenance === "test-fixture") ||
      (context.mode === "test-only" && source.provenance !== "test-fixture")
    ) {
      return bad("source.provenance", "Test and live inputs cannot be mixed");
    }
    if (
      !Array.isArray(source.rows) ||
      source.rows.length > BENCHMARK_LIMITS.rowsPerSource ||
      counts.rawRows + source.rows.length > BENCHMARK_LIMITS.totalRows
    ) {
      return bad("source.rows", "Rows exceed bounded import limits");
    }
    sourceIds.add(source.id);
    const summary: SourceCounts = {
      id: source.id,
      label: source.label,
      rawRows: source.rows.length,
      validRows: 0,
      uncertainRows: 0,
      duplicateRows: 0,
      uniqueProperties: 0,
      exclusiveProperties: 0,
    };
    const seen = new Set<string>();
    const safeRows: (IdentifierRow | null)[] = [];
    for (const [rowIndex, row] of source.rows.entries()) {
      let reason: QuarantinedRow["reason"] | null = null;

      const candidate = record(row)
        ? { market: literal(row.market), scheme: literal(row.scheme), token: literal(row.token) }
        : null;
      safeRows.push(candidate);
      if (!record(row)) {
        reason = "invalid-row";
      } else if (row.market !== context.market) {
        reason = "market-mismatch";
      } else if (
        typeof row.scheme !== "string" ||
        !patterns.has(ruleKey(context.market, row.scheme))
      ) {
        reason = "unknown-scheme";
      } else if (row.token === null || row.token === undefined || row.token === "") {
        reason = "missing-identifier";
      } else if (
        !text(row.token, 128) ||
        !/^[\x21-\x7e]+$/.test(row.token) ||
        !patterns.get(ruleKey(context.market, row.scheme))!.test(row.token)
      ) {
        reason = "invalid-identifier";
      }
      if (reason) {
        quarantine.push({ sourceId: source.id, rowIndex, reason });
        summary.uncertainRows++;
        continue;
      }
      summary.validRows++;
      const identifier: PropertyIdentifier = {
        market: context.market,
        scheme: row.scheme as string,
        token: row.token as string,
      };
      const key = keyOf(identifier);
      if (seen.has(key)) {
        summary.duplicateRows++;
        continue;
      }
      seen.add(key);
      summary.uniqueProperties++;
      const property = properties.get(key);
      if (property) {
        property.sourceIds.push(source.id);
      } else {
        properties.set(key, { key, identifier, sourceIds: [source.id] });
      }
    }
    counts.rawRows += summary.rawRows;
    counts.validRows += summary.validRows;
    counts.uncertainRows += summary.uncertainRows;
    counts.duplicateRows += summary.duplicateRows;
    safeSources.push({
      id: source.id,
      label: source.label,
      context: sourceContext,
      provenance: source.provenance as SourceProvenance,
      rows: safeRows,
    });
    summaries.push(summary);
  }
  const propertyList = [...properties.values()];
  counts.uniqueProperties = propertyList.length;
  counts.overlapProperties = propertyList.filter(
    (property) => property.sourceIds.length > 1,
  ).length;
  for (const summary of summaries) {
    summary.exclusiveProperties = propertyList.filter(
      (property) => property.sourceIds.length === 1 && property.sourceIds[0] === summary.id,
    ).length;
  }
  return ok({
    input: { setup: context, sources: safeSources, rules: safeRules },
    properties: propertyList,
    sources: summaries,
    counts,
    quarantine,
  });
}

function fromInput(input: unknown): Result<Dataset> {
  return record(input)
    ? buildDataset(input.setup, input.sources, input.rules)
    : bad("input", "Missing private input");
}
function blindCompatible(dataset: Dataset) {
  return (
    dataset.input.rules.length === 1 &&
    BLIND_IDENTIFIER_SCHEMES.some((scheme) => scheme === dataset.input.rules[0]!.scheme)
  );
}

export function createBlindState(dataset: unknown, random: () => number): Result<BlindState> {
  if (!record(dataset)) {
    return bad("dataset", "Expected a validated dataset");
  }
  const parsed = fromInput(dataset.input);
  if (parsed.status !== "ok") {
    return parsed;
  }
  if (!blindCompatible(parsed.value)) {
    return bad(
      "rules",
      "Blind comparisons require exactly one common neutral authoritative identifier scheme",
    );
  }
  if (typeof random !== "function") {
    return bad("random", "Explicit secure RNG required; test RNGs for fixtures only");
  }
  const source = parsed.value;
  const used = new Set<string>();
  const cards: BlindState["cards"] = [];
  const word = () => {
    const sample = random();
    if (!finite(sample, 0, 1) || sample === 1) {
      throw new Error("Invalid RNG sample");
    }
    return Math.floor(sample * 4_294_967_296);
  };
  try {
    for (const property of source.properties) {
      let id = "";
      for (let attempts = 0; attempts < 32; attempts++) {
        id = `c_${Array.from({ length: 4 }, () => word().toString(16).padStart(8, "0")).join("")}`;
        if (!used.has(id)) {
          break;
        }
      }
      if (used.has(id)) {
        return bad("random", "Opaque ID collisions exceeded retry limit");
      }
      used.add(id);
      cards.push({ cardId: id, propertyKey: property.key });
    }
    for (let index = cards.length - 1; index > 0; index--) {
      const size = index + 1;
      const limit = Math.floor(4_294_967_296 / size) * size;
      let sample = 0;
      let accepted = false;
      for (let attempt = 0; attempt < 64; attempt++) {
        sample = word();
        if (sample < limit) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        return bad("random", "Shuffle retries exceeded");
      }
      const target = sample % size;
      [cards[index], cards[target]] = [cards[target]!, cards[index]!];
    }
  } catch {
    return bad("random", "RNG failed or returned a sample outside [0,1)");
  }
  return ok({ version: 1, input: source.input, cards });
}

export function restoreBlindState(value: unknown): Result<BlindState> {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.cards)) {
    return bad("state", "Invalid snapshot version/shape");
  }
  const dataset = fromInput(value.input);
  if (dataset.status !== "ok") {
    return dataset;
  }
  if (!blindCompatible(dataset.value)) {
    return bad(
      "rules",
      "Blind comparisons require exactly one common neutral authoritative identifier scheme",
    );
  }
  const keys = new Set(dataset.value.properties.map((property) => property.key));
  const ids = new Set<string>();
  const seen = new Set<string>();
  const cards: BlindState["cards"] = [];
  if (value.cards.length !== keys.size) {
    return bad("cards", "Order must cover every unique property exactly once");
  }
  for (const card of value.cards) {
    if (
      !record(card) ||
      typeof card.cardId !== "string" ||
      card.cardId.length !== 34 ||
      !/^c_[0-9a-f]{32}$/.test(card.cardId) ||
      ids.has(card.cardId) ||
      typeof card.propertyKey !== "string" ||
      !keys.has(card.propertyKey) ||
      seen.has(card.propertyKey)
    ) {
      return bad("cards", "Invalid, duplicate, missing or foreign mapping");
    }
    ids.add(card.cardId);
    seen.add(card.propertyKey);
    cards.push({ cardId: card.cardId, propertyKey: card.propertyKey });
  }
  return ok({ version: 1, input: dataset.value.input, cards });
}

export function blindCards(state: unknown): Result<BlindCard[]> {
  const restored = restoreBlindState(state);
  if (restored.status !== "ok") {
    return restored;
  }
  const dataset = fromInput(restored.value.input);
  if (dataset.status !== "ok") {
    return dataset;
  }
  const lookup = new Map(
    dataset.value.properties.map((property) => [property.key, property.identifier]),
  );
  return ok(
    restored.value.cards.map((card) => {
      const identifier = lookup.get(card.propertyKey)!;
      return {
        cardId: card.cardId,
        identifier: {
          market: identifier.market,
          scheme: identifier.scheme,
          token: identifier.token,
        },
      };
    }),
  );
}

export type Decision = "yes" | "no" | "unknown";
export interface Review {
  cardId: string;
  reviewerId: string;
  useful: Decision;
  correctness: Decision;
  researchSeconds: number | null;
  reason: string;
}
export interface DecisionMetrics {
  yes: number;
  no: number;
  unknown: number;
  missing: number;
  known: number;
  reviewed: number;
  yesKnownRatio: number | null;
  yesReviewedRatio: number | null;
}
export interface ReviewMetrics {
  eligibleProperties: number;
  expectedJudgments: number;
  reviewJudgments: number;
  reviewedProperties: number;
  unreviewedProperties: number;
  propertiesWithAnyUsefulJudgment: number;
  missingJudgments: number;
  useful: DecisionMetrics;
  correctness: DecisionMetrics;
  time: {
    knownSeconds: number;
    timedJudgments: number;
    missingTimeJudgments: number;
    timedUsefulJudgments: number;
    timedUsefulProperties: number;
    timeCoverage: number | null;
    secondsPerTimedUsefulJudgment: number | null;
    secondsPerTimedUsefulProperty: number | null;
  };
}
export interface AgreementValue {
  commonReviewed: number;
  commonKnown: number;
  agreements: number;
  agreementRatio: number | null;
}
export interface Agreement {
  reviewerAIndex: number;
  reviewerBIndex: number;
  useful: AgreementValue;
  correctness: AgreementValue;
}
export interface BenchmarkMetrics {
  mode: "test-only" | "live";
  interpretation: "descriptive-only";
  union: ReviewMetrics;
  agreement: Agreement[];
  sources?: { id: string; label: string; counts: SourceCounts; metrics: ReviewMetrics }[];
  datasetCounts?: DatasetCounts;
}
const isDecision = (value: unknown): value is Decision =>
  value === "yes" || value === "no" || value === "unknown";
function decisionMetrics(reviews: Review[], key: "useful" | "correctness", missing: number) {
  const yes = reviews.filter((review) => review[key] === "yes").length;
  const no = reviews.filter((review) => review[key] === "no").length;
  const unknown = reviews.filter((review) => review[key] === "unknown").length;
  const known = yes + no;
  const reviewed = reviews.length;
  return {
    yes,
    no,
    unknown,
    missing,
    known,
    reviewed,
    yesKnownRatio: ratio(yes, known),
    yesReviewedRatio: ratio(yes, reviewed),
  };
}
function metricsFor(ids: Set<string>, reviews: Review[], reviewerCount: number): ReviewMetrics {
  const relevant = reviews.filter((review) => ids.has(review.cardId));
  const expectedJudgments = ids.size * reviewerCount;
  const reviewJudgments = relevant.length;
  const missingJudgments = expectedJudgments - reviewJudgments;
  const reviewedProperties = new Set(relevant.map((review) => review.cardId)).size;
  const timed = relevant.filter((review) => review.researchSeconds !== null);
  const knownSeconds = timed.reduce((sum, review) => sum + review.researchSeconds!, 0);
  const timedUsefulJudgments = timed.filter((review) => review.useful === "yes").length;
  const timedUsefulProperties = new Set(
    timed.filter((review) => review.useful === "yes").map((review) => review.cardId),
  ).size;
  return {
    eligibleProperties: ids.size,
    expectedJudgments,
    reviewJudgments,
    reviewedProperties,
    unreviewedProperties: ids.size - reviewedProperties,
    propertiesWithAnyUsefulJudgment: new Set(
      relevant.filter((review) => review.useful === "yes").map((review) => review.cardId),
    ).size,
    missingJudgments,
    useful: decisionMetrics(relevant, "useful", missingJudgments),
    correctness: decisionMetrics(relevant, "correctness", missingJudgments),
    time: {
      knownSeconds,
      timedJudgments: timed.length,
      missingTimeJudgments: reviewJudgments - timed.length,
      timedUsefulJudgments,
      timedUsefulProperties,
      timeCoverage: ratio(timed.length, reviewJudgments),
      secondsPerTimedUsefulJudgment: ratio(knownSeconds, timedUsefulJudgments),
      secondsPerTimedUsefulProperty: ratio(knownSeconds, timedUsefulProperties),
    },
  };
}
function agreementFor(reviews: Review[], reviewerIds: string[]): Agreement[] {
  const byReviewer = new Map<string, Map<string, Review>>();
  for (const id of reviewerIds) {
    byReviewer.set(id, new Map());
  }
  for (const review of reviews) {
    byReviewer.get(review.reviewerId)!.set(review.cardId, review);
  }
  const result: Agreement[] = [];
  for (let leftIndex = 0; leftIndex < reviewerIds.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < reviewerIds.length; rightIndex++) {
      const left = byReviewer.get(reviewerIds[leftIndex]!)!;
      const right = byReviewer.get(reviewerIds[rightIndex]!)!;
      const calculate = (field: "useful" | "correctness"): AgreementValue => {
        let commonReviewed = 0;
        let commonKnown = 0;
        let agreements = 0;
        for (const [id, leftReview] of left) {
          const rightReview = right.get(id);
          if (!rightReview) {
            continue;
          }
          commonReviewed++;
          if (leftReview[field] === "unknown" || rightReview[field] === "unknown") {
            continue;
          }
          commonKnown++;
          if (leftReview[field] === rightReview[field]) {
            agreements++;
          }
        }
        return {
          commonReviewed,
          commonKnown,
          agreements,
          agreementRatio: ratio(agreements, commonKnown),
        };
      };
      result.push({
        reviewerAIndex: leftIndex,
        reviewerBIndex: rightIndex,
        useful: calculate("useful"),
        correctness: calculate("correctness"),
      });
    }
  }
  return result;
}
function assignedReviewers(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.length <= BENCHMARK_LIMITS.reviewers &&
    value.every((id) => text(id, 128)) &&
    new Set(value).size === value.length
    ? (value as string[])
    : null;
}
function reviewList(
  reviews: unknown,
  cardIds: Set<string>,
  reviewerIds: string[],
): Result<Review[]> {
  if (!Array.isArray(reviews) || reviews.length > BENCHMARK_LIMITS.reviews) {
    return bad("reviews", "Review array exceeds limit");
  }
  const reviewerSet = new Set(reviewerIds);
  const seen = new Set<string>();
  const safe: Review[] = [];
  for (const review of reviews) {
    if (
      !record(review) ||
      typeof review.cardId !== "string" ||
      !cardIds.has(review.cardId) ||
      typeof review.reviewerId !== "string" ||
      !reviewerSet.has(review.reviewerId) ||
      !isDecision(review.useful) ||
      !isDecision(review.correctness) ||
      !(review.researchSeconds === null || finite(review.researchSeconds, 0, 604_800)) ||
      typeof review.reason !== "string" ||
      review.reason.length > 2000 ||
      review.reason.trim().length === 0
    ) {
      return bad("review", "Invalid card/reviewer/decision/time/reason");
    }
    const key = JSON.stringify([review.cardId, review.reviewerId]);
    if (seen.has(key)) {
      return bad("review", "Duplicate card and reviewer; updates must replace the prior review");
    }
    seen.add(key);
    safe.push({
      cardId: review.cardId,
      reviewerId: review.reviewerId,
      useful: review.useful,
      correctness: review.correctness,
      researchSeconds: review.researchSeconds,
      reason: review.reason,
    });
  }
  return ok(safe);
}

export function validateReviews(
  state: unknown,
  reviews: unknown,
  reviewerIds: unknown,
): Result<Review[]> {
  const restored = restoreBlindState(state);
  if (restored.status !== "ok") {
    return restored;
  }
  const assigned = assignedReviewers(reviewerIds);
  if (!assigned) {
    return bad("reviewerIds", "Unique assigned reviewer IDs required");
  }
  return reviewList(reviews, new Set(restored.value.cards.map((card) => card.cardId)), assigned);
}

export function benchmarkMetrics(
  state: unknown,
  reviews: unknown,
  options: unknown,
): Result<BenchmarkMetrics> {
  const restored = restoreBlindState(state);
  if (restored.status !== "ok") {
    return restored;
  }
  if (!record(options) || typeof options.reveal !== "boolean") {
    return bad("options", "Explicit reveal boolean and unique assigned reviewer IDs required");
  }
  const reviewerIds = assignedReviewers(options.reviewerIds);
  if (!reviewerIds) {
    return bad("options", "Explicit reveal boolean and unique assigned reviewer IDs required");
  }
  const cardIds = new Set(restored.value.cards.map((card) => card.cardId));
  const checked = reviewList(reviews, cardIds, reviewerIds);
  if (checked.status !== "ok") {
    return checked;
  }
  const result: BenchmarkMetrics = {
    mode: restored.value.input.setup.mode,
    interpretation: "descriptive-only",
    union: metricsFor(cardIds, checked.value, reviewerIds.length),
    agreement: agreementFor(checked.value, reviewerIds),
  };
  if (options.reveal) {
    const dataset = fromInput(restored.value.input);
    if (dataset.status !== "ok") {
      return dataset;
    }
    const cardByKey = new Map(restored.value.cards.map((card) => [card.propertyKey, card.cardId]));
    result.datasetCounts = dataset.value.counts;
    result.sources = dataset.value.sources.map((source) => {
      const ids = new Set(
        dataset.value.properties
          .filter((property) => property.sourceIds.includes(source.id))
          .map((property) => cardByKey.get(property.key)!),
      );
      return {
        id: source.id,
        label: source.label,
        counts: source,
        metrics: metricsFor(ids, checked.value, reviewerIds.length),
      };
    });
  }
  return ok(result);
}
