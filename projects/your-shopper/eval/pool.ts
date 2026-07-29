import type { EvaluationCandidate, EvaluationStrategyResult } from "./types.ts";

export function poolCandidates(
  results: ReadonlyArray<{
    readonly strategyId: string;
    readonly result: EvaluationStrategyResult;
  }>,
): ReadonlyArray<EvaluationCandidate> {
  const pooled = new Map<
    string,
    { title?: string; strategies: Set<string>; citations: Set<string> }
  >();
  for (const { strategyId, result } of results) {
    for (const discovered of [
      ...result.citations.map((citation) =>
        citation.title === undefined
          ? { url: citation.url, cited: true }
          : { url: citation.url, title: citation.title, cited: true },
      ),
      ...(result.candidates ?? []).map((discoveredCandidate) =>
        discoveredCandidate.title === undefined
          ? { url: discoveredCandidate.url, cited: false }
          : { url: discoveredCandidate.url, title: discoveredCandidate.title, cited: false },
      ),
      ...urlsFromText(result.output).map((url) => ({ url, cited: true })),
    ]) {
      const normalized = normalizeUrl(discovered.url);
      if (normalized === undefined) {
        continue;
      }
      const current = pooled.get(normalized) ?? {
        strategies: new Set<string>(),
        citations: new Set<string>(),
      };
      current.strategies.add(strategyId);
      if (discovered.cited) {
        current.citations.add(strategyId);
      }
      if (
        current.title === undefined &&
        "title" in discovered &&
        typeof discovered.title === "string"
      ) {
        current.title = discovered.title;
      }
      pooled.set(normalized, current);
    }
  }
  return [...pooled.entries()]
    .map(([url, value]) => pooledCandidate(url, value))
    .toSorted((left, right) => left.url.localeCompare(right.url));
}

function pooledCandidate(
  url: string,
  value: {
    readonly title?: string;
    readonly strategies: Set<string>;
    readonly citations: Set<string>;
  },
): EvaluationCandidate {
  const discoveredBy = [...value.strategies].toSorted();
  const citedBy = [...value.citations].toSorted();
  return value.title === undefined
    ? { url, discoveredBy, citedBy }
    : { url, title: value.title, discoveredBy, citedBy };
}

function urlsFromText(text: string): ReadonlyArray<string> {
  return text.match(/https?:\/\/[^\s)\]}>,]+/g)?.map((url) => url.replace(/[.;:!?]+$/, "")) ?? [];
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/$/, "");
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("utm_") || key === "ref") {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
