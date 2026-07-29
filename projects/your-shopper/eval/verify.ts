import type { WebSearchService, WebSearchSource } from "@templar/web-search";
import { Effect } from "effect";
import type { CandidateVerification, EvaluationCandidate } from "./types.ts";

export const candidateVerificationConfiguration = {
  summaryQuery:
    "Extract only facts explicitly present on this exact page that can verify a purchasing recommendation: exact product or listing identity, current price, stock or listing status, condition, dimensions, capacity, compatibility, warranty, delivery, and fees. Preserve units and state when a field is absent.",
  textMaxCharacters: 2_000,
  maxAgeHours: 1,
  batchSize: 100,
  concurrency: 2,
} as const;

export function verifyCandidates(
  webSearch: WebSearchService,
  candidates: ReadonlyArray<EvaluationCandidate>,
  now: () => number = Date.now,
): Effect.Effect<CandidateVerification> {
  if (candidates.length === 0) {
    return Effect.succeed({ status: "skipped", sources: [], durationMs: 0 });
  }
  const started = now();
  const batches = chunk(candidates, candidateVerificationConfiguration.batchSize);
  return Effect.all(
    batches.map((batch) =>
      webSearch
        .getContents({
          urls: batch.map(({ url }) => url),
          contents: {
            text: { maxCharacters: candidateVerificationConfiguration.textMaxCharacters },
            summary: { query: candidateVerificationConfiguration.summaryQuery },
            maxAgeHours: candidateVerificationConfiguration.maxAgeHours,
          },
        })
        .pipe(
          Effect.match({
            onFailure: (failure) => ({ ok: false as const, failure }),
            onSuccess: (result) => ({ ok: true as const, result }),
          }),
        ),
    ),
    { concurrency: candidateVerificationConfiguration.concurrency },
  ).pipe(
    Effect.map((results): CandidateVerification => {
      const completed = results.filter((result) => result.ok).map(({ result }) => result);
      const failures = results.filter((result) => !result.ok).map(({ failure }) => failure);
      const costs = completed.flatMap(({ costUsd }) => (costUsd === undefined ? [] : [costUsd]));
      const requestIds = completed.flatMap(({ requestId }) =>
        requestId === undefined ? [] : [requestId],
      );
      const raw = completed.map(({ raw: value }) => value);
      const aggregate: CandidateVerification = {
        status: failures.length === 0 ? "completed" : "failed",
        sources: completed.flatMap(({ results: sources }) => sources.map(sourceEvidence)),
        durationMs: Math.max(0, now() - started),
        candidateUrls: candidates.map(({ url }) => url),
      };
      if (costs.length > 0) {
        Object.assign(aggregate, { costUsd: costs.reduce((sum, cost) => sum + cost, 0) });
      }
      if (requestIds.length > 0) {
        Object.assign(aggregate, { requestId: requestIds[0], requestIds });
      }
      if (failures.length > 0) {
        Object.assign(aggregate, { failure: failures });
      }
      if (raw.length > 0) {
        Object.assign(aggregate, { raw: raw.length === 1 ? raw[0] : raw });
      }
      return aggregate;
    }),
  );
}

export function selectVerificationCandidates(
  candidates: ReadonlyArray<EvaluationCandidate>,
  maximum: number,
  randomSeed: number,
): ReadonlyArray<EvaluationCandidate> {
  if (candidates.length <= maximum) {
    return candidates;
  }
  const strategies = [
    ...new Set(candidates.flatMap(({ discoveredBy }) => discoveredBy)),
  ].toSorted();
  const random = seededRandom(randomSeed);
  const priorities = new Map(candidates.map((candidate) => [candidate.url, random()]));
  const ordered = candidates.toSorted((left, right) => {
    const citationDifference = right.citedBy.length - left.citedBy.length;
    if (citationDifference !== 0) {
      return citationDifference;
    }
    const discoveryDifference = right.discoveredBy.length - left.discoveredBy.length;
    if (discoveryDifference !== 0) {
      return discoveryDifference;
    }
    return (priorities.get(left.url) ?? 0) - (priorities.get(right.url) ?? 0);
  });
  const selected = new Map<string, EvaluationCandidate>();
  while (selected.size < maximum) {
    let added = false;
    for (const strategy of strategies) {
      const candidate = ordered.find(
        ({ url, discoveredBy }) => !selected.has(url) && discoveredBy.includes(strategy),
      );
      if (candidate !== undefined) {
        selected.set(candidate.url, candidate);
        added = true;
      }
      if (selected.size === maximum) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }
  for (const candidate of ordered) {
    if (selected.size === maximum) {
      break;
    }
    selected.set(candidate.url, candidate);
  }
  return [...selected.values()];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function chunk<A>(values: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> {
  const chunks: A[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sourceEvidence(source: WebSearchSource): CandidateVerification["sources"][number] {
  return {
    url: source.url,
    ...(source.title === undefined ? {} : { title: source.title }),
    ...(source.publishedDate === undefined ? {} : { publishedDate: source.publishedDate }),
    ...(source.text === undefined ? {} : { text: source.text }),
    ...(source.highlights === undefined ? {} : { highlights: source.highlights }),
    ...(source.summary === undefined ? {} : { summary: source.summary }),
  };
}
