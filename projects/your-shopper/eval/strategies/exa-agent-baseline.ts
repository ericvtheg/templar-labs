import { Effect } from "effect";
import type { EvaluationCase, EvaluationStrategy, EvaluationStrategyResult } from "../types.ts";

const exaAgentBeta = "agent-2026-05-07";
const exaAgentInstructions =
  "If a missing fact that only the user can know is necessary before useful research can continue, respond exactly with NEEDS_INPUT: followed by one focused question. Otherwise complete the research and recommendation without that marker.";

type ExaAgentRun = {
  readonly id?: string;
  readonly status?: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly stopReason?: unknown;
  readonly output?: {
    readonly text?: unknown;
    readonly structured?: unknown;
    readonly grounding?: unknown;
  };
  readonly costDollars?: { readonly total?: unknown };
  readonly durationMs?: unknown;
  readonly usage?: unknown;
  readonly error?: unknown;
};

export function exaAgentStrategy(input: {
  readonly apiKey: string;
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "auto";
  readonly fetch?: typeof fetch;
  readonly pollIntervalMs?: number;
  readonly maxDurationMs?: number;
}): EvaluationStrategy {
  const effort = input.effort ?? "medium";
  const maxDurationMs = input.maxDurationMs ?? 180_000;
  return {
    id: "exa-agent",
    model: "exa-agent-beta",
    reasoning: { effort },
    instructionsVersion: exaAgentBeta,
    instructions: exaAgentInstructions,
    tools: ["exa-agent-managed-tools"],
    maxModelTurns: 0,
    maxToolCalls: 0,
    maxDurationMs,
    runner: (evaluationCase) => runExaAgent(input, effort, maxDurationMs, evaluationCase),
  };
}

function runExaAgent(
  options: {
    readonly apiKey: string;
    readonly fetch?: typeof fetch;
    readonly pollIntervalMs?: number;
  },
  effort: string,
  maxDurationMs: number,
  evaluationCase: EvaluationCase,
): Effect.Effect<EvaluationStrategyResult> {
  const started = Date.now();
  return Effect.tryPromise({
    try: async (signal) => {
      const deadline = started + maxDurationMs;
      const fetchImpl = options.fetch ?? fetch;
      const initialRun = await createAndPollRun(
        fetchImpl,
        options,
        signal,
        initialQuery(evaluationCase),
        effort,
        deadline,
      );
      let run = initialRun;
      const runs = [initialRun];
      if (
        evaluationCase.track === "end_to_end" &&
        evaluationCase.hiddenContext !== undefined &&
        initialRun.status === "completed" &&
        typeof initialRun.id === "string" &&
        requestsInput(initialRun.output?.text)
      ) {
        run = await createAndPollRun(
          fetchImpl,
          options,
          signal,
          `Additional user context:\n${evaluationCase.hiddenContext}\n\nContinue the purchasing research and return the final recommendation.`,
          effort,
          deadline,
          initialRun.id,
        );
        runs.push(run);
      }
      const citations = groundingCitations(run.output?.grounding);
      const totalCostUsd = sumKnown(
        runs.map((item) =>
          typeof item.costDollars?.total === "number" ? item.costDollars.total : undefined,
        ),
      );
      const reportedDurationMs = sumKnown(
        runs.map((item) => (typeof item.durationMs === "number" ? item.durationMs : undefined)),
      );
      const result: EvaluationStrategyResult = {
        status: run.status === "completed" ? "completed" : "failed",
        output:
          typeof run.output?.text === "string"
            ? run.output.text
            : run.error === undefined
              ? "Exa Agent returned no text output."
              : JSON.stringify(run.error),
        citations,
        candidates: citations,
        usage: {
          ...(totalCostUsd === undefined ? {} : { searchCostUsd: totalCostUsd, totalCostUsd }),
          durationMs: reportedDurationMs === undefined ? Date.now() - started : reportedDurationMs,
        },
        trace: { runs },
        raw: { runs },
        ...(run.status === "completed" ? {} : { failure: run.error ?? run.stopReason }),
      };
      return result;
    },
    catch: (cause) => cause,
  }).pipe(
    Effect.timeout(maxDurationMs),
    Effect.catchAll((cause) =>
      Effect.succeed({
        status: "failed" as const,
        output: cause instanceof Error ? cause.message : "Exa Agent failed.",
        citations: [],
        usage: { durationMs: Date.now() - started },
        failure: cause,
      }),
    ),
  );
}

async function createAndPollRun(
  fetchImpl: typeof fetch,
  options: { readonly apiKey: string; readonly pollIntervalMs?: number },
  signal: AbortSignal,
  query: string,
  effort: string,
  deadline: number,
  previousRunId?: string,
): Promise<ExaAgentRun> {
  ensureBeforeDeadline(deadline);
  const created = await exaRequest(fetchImpl, options.apiKey, "/agent/runs", signal, {
    method: "POST",
    body: JSON.stringify({
      query,
      effort,
      ...(previousRunId === undefined ? {} : { previousRunId }),
    }),
  });
  if (typeof created.id !== "string") {
    throw new Error("Exa Agent did not return a run ID.");
  }
  let run = created;
  while (run.status === "queued" || run.status === "running") {
    const remainingMs = ensureBeforeDeadline(deadline);
    // oxlint-disable-next-line no-await-in-loop -- Polling must wait before the next status request.
    await interruptibleDelay(Math.min(options.pollIntervalMs ?? 2_000, remainingMs), signal);
    ensureBeforeDeadline(deadline);
    // oxlint-disable-next-line no-await-in-loop -- Each request depends on the preceding status.
    run = await exaRequest(fetchImpl, options.apiKey, `/agent/runs/${created.id}`, signal);
  }
  return run;
}

function initialQuery(evaluationCase: EvaluationCase): string {
  const request = [evaluationCase.intent, evaluationCase.context].filter(Boolean).join("\n\n");
  return `${exaAgentInstructions}\n\nUser request:\n${request}`;
}

function requestsInput(text: unknown): boolean {
  return typeof text === "string" && text.trimStart().toUpperCase().startsWith("NEEDS_INPUT:");
}

function ensureBeforeDeadline(deadline: number): number {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new Error("Exa Agent exceeded its evaluation duration limit.");
  }
  return remainingMs;
}

function sumKnown(values: ReadonlyArray<number | undefined>): number | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? undefined : known.reduce((sum, value) => sum + value, 0);
}

async function exaRequest(
  fetchImpl: typeof fetch,
  apiKey: string,
  path: string,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<ExaAgentRun> {
  const response = await fetchImpl(`https://api.exa.ai${path}`, {
    ...init,
    signal,
    headers: {
      "Content-Type": "application/json",
      "Exa-Beta": exaAgentBeta,
      "x-api-key": apiKey,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Exa Agent returned HTTP ${response.status}.`);
  }
  return (await response.json()) as ExaAgentRun;
}

function groundingCitations(
  grounding: unknown,
): ReadonlyArray<{ readonly url: string; readonly title?: string }> {
  if (!Array.isArray(grounding)) {
    return [];
  }
  const found = new Map<string, { url: string; title?: string }>();
  for (const group of grounding) {
    if (typeof group !== "object" || group === null) {
      continue;
    }
    const groupRecord = group as Record<string, unknown> & { readonly citations?: unknown };
    const citations = groupRecord.citations;
    if (!Array.isArray(citations)) {
      continue;
    }
    for (const citation of citations) {
      if (typeof citation !== "object" || citation === null) {
        continue;
      }
      const record = citation as Record<string, unknown> & {
        readonly title?: unknown;
        readonly url?: unknown;
      };
      if (typeof record.url !== "string") {
        continue;
      }
      found.set(record.url, {
        url: record.url,
        ...(typeof record.title === "string" ? { title: record.title } : {}),
      });
    }
  }
  return [...found.values()];
}

function interruptibleDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}
