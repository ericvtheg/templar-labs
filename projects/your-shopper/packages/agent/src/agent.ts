import { type AgentRun, type AgentToolOutput, makeAgent } from "@templar/agent";
import { Effect } from "effect";
import { resolveShopperAgentConfig, type ShopperAgentConfig } from "./config.ts";
import type {
  ShopperAgent,
  ShopperCitation,
  ShopperOutcome,
  ShopperRun,
  StartShoppingInput,
} from "./types.ts";

export function makeShopperAgent(config: ShopperAgentConfig): ShopperAgent {
  const agent = makeAgent(resolveShopperAgentConfig(config));
  return {
    start: (input) => Effect.map(agent.start(startInput(input)), shopperRun),
    continue: (input) =>
      Effect.map(
        agent.continue({
          run: input.run.agentRun,
          toolResult: { userMessage: input.message },
        }),
        shopperRun,
      ),
  };
}

function startInput(input: StartShoppingInput) {
  return {
    messages: [
      {
        role: "user" as const,
        content:
          input.context === undefined
            ? input.intent
            : `${input.intent}\n\nAdditional user context:\n${input.context}`,
      },
    ],
    ...(input.runId === undefined ? {} : { runId: input.runId }),
  };
}

function shopperRun(run: AgentRun): ShopperRun {
  const outcome = shopperOutcome(run);
  return {
    id: run.id,
    status: run.status,
    ...(outcome === undefined ? {} : { outcome }),
    usage: run.usage,
    agentRun: run,
  };
}

function shopperOutcome(run: AgentRun): ShopperOutcome | undefined {
  if (run.outcome?.kind === "suspension") {
    const request = run.outcome.request;
    const text =
      typeof request === "object" &&
      request !== null &&
      "question" in request &&
      typeof request.question === "string"
        ? request.question
        : JSON.stringify(request);
    return { kind: "question", text, data: request };
  }
  if (run.outcome?.kind === "completion") {
    return {
      kind: "answer",
      text: run.outcome.text,
      citations: citationsForAnswer(run, run.outcome.text),
    };
  }
  return undefined;
}

function citationsForAnswer(run: AgentRun, answer: string): ReadonlyArray<ShopperCitation> {
  const mentionedUrls = new Set(
    answer.match(/https?:\/\/[^\s)\]}>,]+/g)?.map((url) => url.replace(/[.;:!?]+$/, "")) ?? [],
  );
  const citations = new Map<string, ShopperCitation>();
  for (const trace of run.trace.toolCalls) {
    const output = trace.output as AgentToolOutput | undefined;
    if (output?.kind !== "result") {
      continue;
    }
    for (const source of sourcesFromValue(output.value)) {
      if (mentionedUrls.has(source.url)) {
        citations.set(source.url, source);
      }
    }
  }
  return [...citations.values()];
}

function sourcesFromValue(value: unknown): ReadonlyArray<ShopperCitation> {
  if (typeof value !== "object" || value === null || !("results" in value)) {
    return [];
  }
  const results = (value as { readonly results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((result: unknown) => {
    if (typeof result !== "object" || result === null) {
      return [];
    }
    const record = result as Record<string, unknown> & {
      readonly title?: unknown;
      readonly url?: unknown;
    };
    return typeof record.url === "string"
      ? [
          {
            url: record.url,
            ...(typeof record.title === "string" ? { title: record.title } : {}),
          },
        ]
      : [];
  });
}
