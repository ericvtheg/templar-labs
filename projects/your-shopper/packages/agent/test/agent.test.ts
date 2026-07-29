import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTurnInput,
  GenerateTurnResult,
  LLMError,
  LLMService,
} from "@templar/llm";
import type { WebSearchService } from "@templar/web-search";
import { Effect } from "effect";
import type { z } from "zod";
import { makeShopperAgent } from "../src/agent.ts";
import {
  defaultShopperFinalizationModel,
  defaultShopperHardCostLimitUsd,
  defaultShopperModel,
  defaultShopperSoftCostLimitUsd,
} from "../src/config.ts";
import {
  shopperFinalizationInstructions,
  shopperInstructionsVersion,
} from "../src/instructions.ts";

test("shopper agent researches and returns cited actionable output", async () => {
  const { llm, requests } = scriptedLLM([
    turn({
      toolCalls: [
        {
          id: "search-1",
          name: "web_search",
          arguments: '{"query":"narrow espresso machine"}',
        },
      ],
    }),
    turn({
      text: "Choose the Example machine: https://shop.example/machine",
    }),
  ]);
  const agent = makeShopperAgent({
    llm,
    webSearch: successfulSearch(),
    createRunId: () => "shopper-1",
  });
  const run = await Effect.runPromise(
    agent.start({ intent: "Find an espresso machine", context: "It must fit under 30 cm." }),
  );

  assert.equal(run.id, "shopper-1");
  assert.equal(run.status, "completed");
  assert.deepEqual(run.outcome, {
    kind: "answer",
    text: "Choose the Example machine: https://shop.example/machine",
    citations: [{ url: "https://shop.example/machine", title: "Example machine" }],
  });
  assert.equal(run.agentRun.config.model, defaultShopperModel);
  assert.equal(run.agentRun.config.finalizationModel, defaultShopperFinalizationModel);
  assert.equal(run.agentRun.config.maxConcurrentTools, 2);
  assert.equal(run.agentRun.config.toolChoice, "required");
  assert.equal(run.agentRun.config.softCostLimitUsd, defaultShopperSoftCostLimitUsd);
  assert.equal(run.agentRun.config.hardCostLimitUsd, defaultShopperHardCostLimitUsd);
  assert.equal(run.agentRun.config.instructionsVersion, shopperInstructionsVersion);
  assert.equal(run.agentRun.config.finalizationInstructions, shopperFinalizationInstructions);
  assert.deepEqual(
    run.agentRun.config.tools.map((tool) => tool.name),
    ["web_search", "get_web_contents", "ask_user"],
  );
  assert.equal(requests[0]?.messages[1]?.role, "user");
  if (requests[0]?.messages[1]?.role === "user") {
    assert.equal(requests[0].messages[1].content.includes("under 30 cm"), true);
  }
  assert.equal(requests[0]?.toolChoice, "required");
});

test("shopper agent maps clarification suspension and continues the same run", async () => {
  const { llm, requests } = scriptedLLM([
    turn({
      toolCalls: [
        {
          id: "ask-1",
          name: "ask_user",
          arguments: '{"question":"What is your maximum width?"}',
        },
      ],
    }),
    turn({ text: "The narrow option fits." }),
  ]);
  const agent = makeShopperAgent({
    llm,
    webSearch: successfulSearch(),
    createRunId: () => "shopper-question",
  });
  const waiting = await Effect.runPromise(agent.start({ intent: "Find a machine" }));

  assert.equal(waiting.status, "waiting_for_input");
  assert.deepEqual(waiting.outcome, {
    kind: "question",
    text: "What is your maximum width?",
    data: { question: "What is your maximum width?" },
  });

  const completed = await Effect.runPromise(agent.continue({ run: waiting, message: "30 cm" }));
  assert.equal(completed.id, waiting.id);
  assert.equal(completed.status, "completed");
  assert.deepEqual(requests[1]?.messages.at(-1), {
    role: "tool",
    toolCallId: "ask-1",
    name: "ask_user",
    content: '{"userMessage":"30 cm"}',
  });
});

function successfulSearch(): WebSearchService {
  return {
    search: () =>
      Effect.succeed({
        results: [{ url: "https://shop.example/machine", title: "Example machine" }],
        grounding: [],
        requestId: "exa-1",
        costUsd: 0.01,
        raw: { results: [] },
      }),
    getContents: () =>
      Effect.succeed({
        results: [],
        raw: { results: [] },
      }),
  } as WebSearchService;
}

function turn(input: Partial<GenerateTurnResult>): Effect.Effect<GenerateTurnResult, LLMError> {
  return Effect.succeed({
    toolCalls: [],
    model: "resolved/test-model",
    provider: "test",
    ...input,
  });
}

function scriptedLLM(steps: Array<Effect.Effect<GenerateTurnResult, LLMError>>) {
  const requests: GenerateTurnInput[] = [];
  let index = 0;
  const llm: LLMService = {
    generateTurn: (input) => {
      requests.push(input);
      return steps[index++] ?? Effect.die(new Error("No scripted turn remains."));
    },
    generateText: (_input: GenerateTextInput) => Effect.die("Not used"),
    generateObject: <S extends z.ZodType>(
      _input: GenerateObjectInput<S>,
    ): Effect.Effect<GenerateObjectResult<z.output<S>>, LLMError> => Effect.die("Not used"),
  };
  return { llm, requests };
}
