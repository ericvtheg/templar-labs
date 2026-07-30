import { createHash } from "node:crypto";
import { evaluationJudgeInstructions, evaluationProtocolInstructions } from "./evaluator.ts";
import type {
  EvaluationCase,
  EvaluationLLMConfiguration,
  EvaluationResumeManifest,
  EvaluationRunConfiguration,
  EvaluationStrategy,
  EvaluationStrategyConfiguration,
} from "./types.ts";
import { candidateVerificationConfiguration } from "./verify.ts";

export function evaluationResumeManifest(input: {
  readonly evaluationCase: EvaluationCase;
  readonly strategies: ReadonlyArray<EvaluationStrategy>;
  readonly evaluator: EvaluationLLMConfiguration;
  readonly judge: EvaluationLLMConfiguration;
  readonly evaluationConfiguration: EvaluationRunConfiguration;
}): EvaluationResumeManifest {
  return {
    artifactVersion: "2",
    harnessVersion: "your-shopper-eval-v3-local-sol-judge",
    evaluationCase: input.evaluationCase,
    strategies: input.strategies.map(strategyConfiguration),
    evaluator: input.evaluator,
    judge: input.judge,
    evaluationConfiguration: input.evaluationConfiguration,
    evaluationProtocolInstructions,
    evaluationJudgeInstructions,
    candidateVerificationConfiguration,
  };
}

export function evaluationResumeFingerprint(manifest: EvaluationResumeManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

function strategyConfiguration(strategy: EvaluationStrategy): EvaluationStrategyConfiguration {
  const { runner: _runner, ...configuration } = strategy;
  return configuration;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}
