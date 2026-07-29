import assert from "node:assert/strict";
import { test } from "node:test";
import { developmentCases } from "../eval/cases/development/index.ts";
import { poolCandidates } from "../eval/pool.ts";
import { comparisonReport } from "../eval/report.ts";
import { evaluationResumeFingerprint, evaluationResumeManifest } from "../eval/resume.ts";
import type { ComparisonArtifact, EvaluationStrategyResult } from "../eval/types.ts";

test("development matrix starts with twelve varied missions", () => {
  assert.equal(developmentCases.length, 12);
  assert.equal(new Set(developmentCases.map(({ id }) => id)).size, 12);
  assert.deepEqual(
    new Set(developmentCases.map(({ track }) => track)),
    new Set(["clarification", "research_decision", "end_to_end"]),
  );
  assert.equal(
    developmentCases.some(({ tags }) => tags.some((tag) => tag === "impossible-constraints")),
    true,
  );
  assert.equal(
    developmentCases.some(({ tags }) => tags.some((tag) => tag === "alternative-acquisition")),
    true,
  );
});

test("candidate pooling normalizes, deduplicates, and retains discovery provenance", () => {
  const results = [
    {
      strategyId: "one",
      result: strategyResult("See https://example.com/item?utm_source=test", [
        { url: "https://example.com/item/", title: "Item" },
      ]),
    },
    {
      strategyId: "two",
      result: {
        ...strategyResult("Alternative https://example.com/item#details"),
        candidates: [{ url: "https://example.com/from-tool", title: "Tool discovery" }],
      },
    },
  ];

  assert.deepEqual(poolCandidates(results), [
    {
      url: "https://example.com/from-tool",
      title: "Tool discovery",
      discoveredBy: ["two"],
      citedBy: [],
    },
    {
      url: "https://example.com/item",
      title: "Item",
      discoveredBy: ["one", "two"],
      citedBy: ["one", "two"],
    },
  ]);
});

test("comparison reports keep ranking, human review, and costs visible", () => {
  const protocol = {
    likelyObjective: "Buy well",
    hardRequirements: [],
    valueDimensions: [],
    materialFacts: [],
    failureConditions: [],
    meaningfulImprovement: "Better fit",
    unknowns: [],
  };
  const judgment = {
    ranking: ["output-A"],
    reliability: [{ outputId: "output-A", passes: true, hardRequirements: [], concerns: [] }],
    rationale: "Best supported.",
    requiresHumanReview: true,
  };
  const evaluatorConfiguration = { model: "openai/gpt-5.6-sol", reasoning: { effort: "high" } };
  const evaluationConfiguration = { strategyConcurrency: 1, maxVerificationCandidates: 24 };
  const strategy = {
    id: "your-shopper",
    model: "openai/gpt-5.6-sol",
    instructionsVersion: "shopper-v1",
    tools: [],
    maxModelTurns: 1,
    maxToolCalls: 0,
    runner: () => {
      throw new Error("Not used");
    },
  };
  const resumeManifest = evaluationResumeManifest({
    evaluationCase: developmentCases[0],
    strategies: [strategy],
    evaluator: evaluatorConfiguration,
    judge: evaluatorConfiguration,
    evaluationConfiguration,
  });
  const comparison = {
    artifactVersion: "2",
    timestamp: "2026-07-29T00:00:00.000Z",
    resumeManifest,
    resumeFingerprint: evaluationResumeFingerprint(resumeManifest),
    evaluationCase: developmentCases[0],
    protocol,
    evaluator: {
      configuration: evaluatorConfiguration,
      durationMs: 10,
      failedAttempts: [],
      result: {
        value: protocol,
        text: JSON.stringify(protocol),
        model: "openai/gpt-5.6-sol",
        provider: "openrouter",
        usage: { costUsd: 0.01 },
      },
    },
    judge: {
      configuration: evaluatorConfiguration,
      durationMs: 10,
      failedAttempts: [],
      result: {
        value: judgment,
        text: JSON.stringify(judgment),
        model: "openai/gpt-5.6-sol",
        provider: "openrouter",
        usage: { costUsd: 0.01 },
      },
    },
    randomSeed: 7,
    evaluationConfiguration,
    strategies: resumeManifest.strategies,
    outputs: [
      {
        outputId: "output-A",
        strategyId: "your-shopper",
        result: strategyResult("Answer", [], 0.12),
      },
    ],
    candidates: [],
    verification: { status: "skipped", sources: [], durationMs: 0 },
    judgment,
  } satisfies ComparisonArtifact;
  const report = comparisonReport([comparison]);

  assert.equal(report.includes("your-shopper →"), false);
  assert.equal(report.includes("| your-shopper | 1/1 | 1.00 | 1/1 | 1/1 | $0.1200 |"), true);
  assert.equal(report.includes("$0.1200"), true);
  assert.equal(report.includes("$0.0200"), true);
  assert.equal(report.includes("recorded total cost: $0.1400"), true);
  assert.equal(report.includes("Human review"), true);
});

function strategyResult(
  output: string,
  citations: EvaluationStrategyResult["citations"] = [],
  totalCostUsd?: number,
): EvaluationStrategyResult {
  return {
    status: "completed",
    output,
    citations,
    usage: { durationMs: 1, ...(totalCostUsd === undefined ? {} : { totalCostUsd }) },
  };
}
