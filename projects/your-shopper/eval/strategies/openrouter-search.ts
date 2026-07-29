import type { GenerateTextResult, LLMMessage, LLMService } from "@templar/llm";
import { Effect } from "effect";
import type { EvaluationCase, EvaluationStrategy, EvaluationStrategyResult } from "../types.ts";

const managedSearchInstructionsVersion = "openrouter-managed-search-v1";
const managedSearchInstructions =
  "Act as a general-purpose purchasing research assistant. Identify hard requirements, search the web when current evidence matters, verify decisive claims, and cite direct URLs. Ask the user only for preferences, constraints, or circumstances that only the user can know and that would materially change the research direction; in that case respond only with NEEDS_INPUT: followed by one focused question. Never ask the user to research public facts such as product specifications, prices, availability, or warranty. Research those yourself, and clearly label them unknown if they cannot be verified. Otherwise return an actionable recommendation with uncertainty made explicit.";

export type OpenRouterSearchStrategyOptions = {
  readonly llm: LLMService;
  readonly model: string;
  readonly reasoning?: unknown;
  readonly engine?: "parallel" | "exa" | "perplexity" | "native" | "auto";
  readonly maxUses?: number;
  readonly maxResults?: number;
  readonly maxTotalResults?: number;
  readonly maxCharacters?: number;
  readonly maxDurationMs?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
};

export function openRouterSearchStrategy(
  options: OpenRouterSearchStrategyOptions,
): EvaluationStrategy {
  const engine = options.engine ?? "parallel";
  const maxUses = options.maxUses ?? 3;
  const maxResults = options.maxResults ?? 5;
  const maxTotalResults = options.maxTotalResults ?? 15;
  const maxCharacters = options.maxCharacters ?? 2_000;
  const maxDurationMs = options.maxDurationMs ?? 120_000;
  return {
    id: "openrouter-search-agent",
    model: options.model,
    ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
    instructionsVersion: managedSearchInstructionsVersion,
    instructions: managedSearchInstructions,
    tools: [`openrouter:web_search(engine=${engine})`],
    maxModelTurns: 2,
    maxToolCalls: maxUses,
    maxDurationMs,
    providerOptions: {
      ...options.providerOptions,
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            engine,
            max_uses: maxUses,
            max_results: maxResults,
            max_total_results: maxTotalResults,
            max_characters: maxCharacters,
          },
        },
      ],
      max_tool_calls: maxUses,
    },
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    runner: (evaluationCase) => runManagedSearch(options, evaluationCase),
  };
}

function runManagedSearch(
  options: OpenRouterSearchStrategyOptions,
  evaluationCase: EvaluationCase,
): Effect.Effect<EvaluationStrategyResult> {
  const started = Date.now();
  const messages: ReadonlyArray<LLMMessage> = [
    {
      role: "system",
      content: managedSearchInstructions,
    },
    {
      role: "user",
      content: [evaluationCase.intent, evaluationCase.context].filter(Boolean).join("\n\n"),
    },
  ];
  return Effect.flatMap(generate(options, messages), (initial) => {
    if (
      evaluationCase.track === "end_to_end" &&
      evaluationCase.hiddenContext !== undefined &&
      needsInput(initial.text)
    ) {
      return Effect.map(
        generate(options, [
          ...messages,
          { role: "assistant", content: initial.text },
          { role: "user", content: evaluationCase.hiddenContext },
        ]),
        (continued) => managedResult([initial, continued], started),
      );
    }
    return Effect.succeed(managedResult([initial], started));
  }).pipe(
    Effect.timeout(options.maxDurationMs ?? 120_000),
    Effect.catchAll((failure) =>
      Effect.succeed({
        status: "failed" as const,
        output: failure instanceof Error ? failure.message : "OpenRouter managed search failed.",
        citations: [],
        usage: { durationMs: Date.now() - started },
        failure,
      }),
    ),
  );
}

function generate(
  options: OpenRouterSearchStrategyOptions,
  messages: ReadonlyArray<LLMMessage>,
): Effect.Effect<GenerateTextResult, import("@templar/llm").LLMError> {
  const maxUses = options.maxUses ?? 3;
  return options.llm.generateText({
    model: options.model,
    messages,
    ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    providerOptions: {
      ...options.providerOptions,
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            engine: options.engine ?? "parallel",
            max_uses: maxUses,
            max_results: options.maxResults ?? 5,
            max_total_results: options.maxTotalResults ?? 15,
            max_characters: options.maxCharacters ?? 2_000,
          },
        },
      ],
      max_tool_calls: maxUses,
    },
  });
}

function managedResult(
  results: ReadonlyArray<GenerateTextResult>,
  started: number,
): EvaluationStrategyResult {
  const final = results.at(-1) as GenerateTextResult;
  const citations = citationsFromRaw(final.raw);
  const totalCostUsd = sumKnown(results.map(({ usage }) => usage?.costUsd));
  return {
    status: needsInput(final.text) ? "waiting_for_input" : "completed",
    output: final.text,
    citations,
    candidates: citations,
    usage: {
      ...(totalCostUsd === undefined ? {} : { totalCostUsd }),
      durationMs: Date.now() - started,
      modelTurns: results.length,
      toolCalls: results.reduce((sum, result) => sum + webSearchRequests(result.raw), 0),
    },
    trace: { results },
    raw: { results },
  };
}

function citationsFromRaw(
  raw: unknown,
): ReadonlyArray<{ readonly url: string; readonly title?: string }> {
  const message = responseMessage(raw);
  if (message === undefined || !Array.isArray(message.annotations)) {
    return [];
  }
  const citations = new Map<string, { readonly url: string; readonly title?: string }>();
  for (const annotation of message.annotations) {
    if (typeof annotation !== "object" || annotation === null) {
      continue;
    }
    const value = (annotation as { readonly url_citation?: unknown }).url_citation;
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const record = value as { readonly url?: unknown; readonly title?: unknown };
    if (typeof record.url !== "string") {
      continue;
    }
    citations.set(
      record.url,
      typeof record.title === "string"
        ? { url: record.url, title: record.title }
        : { url: record.url },
    );
  }
  return [...citations.values()];
}

function webSearchRequests(raw: unknown): number {
  if (typeof raw !== "object" || raw === null || !("usage" in raw)) {
    return 0;
  }
  const usage = raw.usage;
  if (typeof usage !== "object" || usage === null) {
    return 0;
  }
  const serverToolUse =
    "server_tool_use_details" in usage
      ? usage.server_tool_use_details
      : "server_tool_use" in usage
        ? usage.server_tool_use
        : undefined;
  if (
    typeof serverToolUse !== "object" ||
    serverToolUse === null ||
    !("web_search_requests" in serverToolUse)
  ) {
    return 0;
  }
  return typeof serverToolUse.web_search_requests === "number"
    ? serverToolUse.web_search_requests
    : 0;
}

function responseMessage(raw: unknown): { readonly annotations?: unknown } | undefined {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("choices" in raw) ||
    !Array.isArray(raw.choices)
  ) {
    return undefined;
  }
  const choice = raw.choices[0];
  if (typeof choice !== "object" || choice === null || !("message" in choice)) {
    return undefined;
  }
  return typeof choice.message === "object" && choice.message !== null
    ? (choice.message as { readonly annotations?: unknown })
    : undefined;
}

function needsInput(text: string): boolean {
  return text.trimStart().toUpperCase().startsWith("NEEDS_INPUT:");
}

function sumKnown(values: ReadonlyArray<number | undefined>): number | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? undefined : known.reduce((sum, value) => sum + value, 0);
}
