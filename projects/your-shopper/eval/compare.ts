import type { LLMService } from "@templar/llm";
import type { WebSearchService } from "@templar/web-search";
import { Effect } from "effect";
import { createEvaluationProtocol, judgeEvaluationOutputs } from "./evaluator.ts";
import { poolCandidates } from "./pool.ts";
import { evaluationResumeFingerprint, evaluationResumeManifest } from "./resume.ts";
import type {
  ComparisonArtifact,
  EvaluationCase,
  EvaluationCheckpoint,
  EvaluationLLMConfiguration,
  EvaluationStrategy,
} from "./types.ts";
import { selectVerificationCandidates, verifyCandidates } from "./verify.ts";

export function compareStrategies(input: {
  readonly evaluationCase: EvaluationCase;
  readonly strategies: ReadonlyArray<EvaluationStrategy>;
  readonly evaluatorLLM: LLMService;
  readonly evaluator: EvaluationLLMConfiguration;
  readonly judge?: EvaluationLLMConfiguration;
  readonly webSearch: WebSearchService;
  readonly randomSeed: number;
  readonly maxVerificationCandidates?: number;
  readonly strategyConcurrency?: number;
  readonly resumeCheckpoint?: EvaluationCheckpoint;
  readonly onCheckpoint?: (checkpoint: EvaluationCheckpoint) => Promise<void>;
  readonly now?: () => Date;
}): Effect.Effect<ComparisonArtifact, import("@templar/llm").LLMError> {
  const now = input.now ?? (() => new Date());
  const evaluationConfiguration = {
    strategyConcurrency: input.strategyConcurrency ?? 1,
    maxVerificationCandidates: input.maxVerificationCandidates ?? 24,
  };
  const judgeConfiguration = input.judge ?? input.evaluator;
  const resumeManifest = evaluationResumeManifest({
    evaluationCase: input.evaluationCase,
    strategies: input.strategies,
    evaluator: input.evaluator,
    judge: judgeConfiguration,
    evaluationConfiguration,
  });
  const resumeFingerprint = evaluationResumeFingerprint(resumeManifest);
  if (
    input.resumeCheckpoint !== undefined &&
    input.resumeCheckpoint.resumeFingerprint !== resumeFingerprint
  ) {
    return Effect.die(
      new Error(
        `Resume checkpoint configuration mismatch for ${input.evaluationCase.id}. Refusing to repeat or mix paid stages.`,
      ),
    );
  }
  if (input.resumeCheckpoint?.comparison !== undefined) {
    if (input.resumeCheckpoint.comparison.resumeFingerprint !== resumeFingerprint) {
      return Effect.die(
        new Error(`Completed checkpoint comparison mismatch for ${input.evaluationCase.id}.`),
      );
    }
    return Effect.succeed(input.resumeCheckpoint.comparison);
  }
  return Effect.gen(function* () {
    const evaluator =
      input.resumeCheckpoint?.evaluator ??
      (yield* createEvaluationProtocol(input.evaluatorLLM, input.evaluator, input.evaluationCase));
    if (input.resumeCheckpoint?.evaluator === undefined) {
      yield* checkpoint(input.onCheckpoint, {
        artifactVersion: "2",
        resumeManifest,
        resumeFingerprint,
        stage: "protocol",
        evaluationCase: input.evaluationCase,
        randomSeed: input.randomSeed,
        evaluationConfiguration,
        evaluator,
      });
    }
    const checkpointResults =
      input.resumeCheckpoint?.strategyResults ??
      (yield* Effect.all(
        input.strategies.map((strategy) =>
          Effect.map(strategy.runner(input.evaluationCase), (result) => ({
            strategyId: strategy.id,
            result,
          })),
        ),
        { concurrency: evaluationConfiguration.strategyConcurrency },
      ));
    const pooled = input.resumeCheckpoint?.candidates ?? poolCandidates(checkpointResults);
    if (input.resumeCheckpoint?.strategyResults === undefined) {
      yield* checkpoint(input.onCheckpoint, {
        artifactVersion: "2",
        resumeManifest,
        resumeFingerprint,
        stage: "strategies",
        evaluationCase: input.evaluationCase,
        randomSeed: input.randomSeed,
        evaluationConfiguration,
        evaluator,
        strategyResults: checkpointResults,
        candidates: pooled,
      });
    }
    const verificationCandidates = selectVerificationCandidates(
      pooled,
      evaluationConfiguration.maxVerificationCandidates,
      input.randomSeed,
    );
    const blinded = shuffle(checkpointResults, seededRandom(input.randomSeed)).map((entry, index) =>
      relabelOutput(entry, index),
    );
    const verification =
      input.resumeCheckpoint?.verification ??
      (yield* verifyCandidates(input.webSearch, verificationCandidates));
    if (input.resumeCheckpoint?.verification === undefined) {
      yield* checkpoint(input.onCheckpoint, {
        artifactVersion: "2",
        resumeManifest,
        resumeFingerprint,
        stage: "verification",
        evaluationCase: input.evaluationCase,
        randomSeed: input.randomSeed,
        evaluationConfiguration,
        evaluator,
        strategyResults: checkpointResults,
        candidates: pooled,
        verification,
      });
    }
    const judge = yield* judgeEvaluationOutputs(
      input.evaluatorLLM,
      judgeConfiguration,
      input.evaluationCase,
      evaluator.result.value,
      blinded.map(({ outputId, result }) => ({ outputId, result })),
      verificationCandidates.map(({ url, title }) =>
        title === undefined ? { url } : { url, title },
      ),
      verification,
    );
    const comparison: ComparisonArtifact = {
      artifactVersion: "2",
      timestamp: now().toISOString(),
      resumeManifest,
      resumeFingerprint,
      evaluationCase: input.evaluationCase,
      protocol: evaluator.result.value,
      evaluator,
      judge,
      randomSeed: input.randomSeed,
      evaluationConfiguration,
      strategies: resumeManifest.strategies,
      outputs: blinded,
      candidates: pooled,
      verification,
      judgment: judge.result.value,
    };
    yield* checkpoint(input.onCheckpoint, {
      artifactVersion: "2",
      resumeManifest,
      resumeFingerprint,
      stage: "complete",
      evaluationCase: input.evaluationCase,
      randomSeed: input.randomSeed,
      evaluationConfiguration,
      comparison,
    });
    return comparison;
  });
}

function checkpoint(
  writer: ((checkpoint: EvaluationCheckpoint) => Promise<void>) | undefined,
  value: EvaluationCheckpoint,
): Effect.Effect<void> {
  return writer === undefined ? Effect.void : Effect.promise(() => writer(value));
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

function relabelOutput<A extends { readonly strategyId: string; readonly result: unknown }>(
  entry: A,
  index: number,
): A & { readonly outputId: string } {
  return {
    ...entry,
    outputId: `output-${String.fromCharCode(65 + index)}`,
  };
}

function shuffle<A>(values: ReadonlyArray<A>, random: () => number): A[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const value = result[index] as A;
    result[index] = result[target] as A;
    result[target] = value;
  }
  return result;
}
