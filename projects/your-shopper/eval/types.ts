import type { AgentRun } from "@templar/agent";
import type { GenerateObjectResult } from "@templar/llm";

export type EvaluationTrack = "clarification" | "research_decision" | "end_to_end";

export type EvaluationCase = {
  readonly id: string;
  readonly track: EvaluationTrack;
  readonly intent: string;
  readonly context?: string;
  readonly hiddenContext?: string;
  readonly tags: ReadonlyArray<string>;
};

export type EvaluationProtocol = {
  readonly likelyObjective: string;
  readonly hardRequirements: ReadonlyArray<string>;
  readonly valueDimensions: ReadonlyArray<string>;
  readonly materialFacts: ReadonlyArray<string>;
  readonly failureConditions: ReadonlyArray<string>;
  readonly meaningfulImprovement: string;
  readonly unknowns: ReadonlyArray<string>;
};

export type EvaluationCandidate = {
  readonly url: string;
  readonly title?: string;
  readonly discoveredBy: ReadonlyArray<string>;
  readonly citedBy: ReadonlyArray<string>;
};

export type StrategyUsage = {
  readonly aiCostUsd?: number;
  readonly searchCostUsd?: number;
  readonly totalCostUsd?: number;
  readonly durationMs: number;
  readonly modelTurns?: number;
  readonly toolCalls?: number;
};

export type EvaluationStrategyResult = {
  readonly status: "completed" | "waiting_for_input" | "failed";
  readonly output: string;
  readonly citations: ReadonlyArray<{ readonly url: string; readonly title?: string }>;
  readonly candidates?: ReadonlyArray<{ readonly url: string; readonly title?: string }>;
  readonly usage: StrategyUsage;
  readonly trace?: AgentRun["trace"] | unknown;
  readonly raw?: unknown;
  readonly failure?: unknown;
};

export type EvaluationLLMConfiguration = {
  readonly backend?: "codex-cli-chatgpt";
  readonly model: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly maxDurationMs?: number;
};

export type EvaluationLLMRun<A> = {
  readonly configuration: EvaluationLLMConfiguration;
  readonly result: GenerateObjectResult<A>;
  readonly failedAttempts: ReadonlyArray<{
    readonly model: string;
    readonly provider?: string;
    readonly text: string;
    readonly usage?: GenerateObjectResult<unknown>["usage"];
    readonly raw?: unknown;
  }>;
  readonly durationMs: number;
};

export type CandidateVerification = {
  readonly status: "completed" | "failed" | "skipped";
  readonly sources: ReadonlyArray<{
    readonly url: string;
    readonly title?: string;
    readonly publishedDate?: string;
    readonly text?: string;
    readonly highlights?: ReadonlyArray<string>;
    readonly summary?: string;
  }>;
  readonly durationMs: number;
  readonly candidateUrls?: ReadonlyArray<string>;
  readonly costUsd?: number;
  readonly requestId?: string;
  readonly requestIds?: ReadonlyArray<string>;
  readonly failure?: unknown;
  readonly raw?: unknown;
};

export type EvaluationStrategyRunner = (
  evaluationCase: EvaluationCase,
) => import("effect").Effect.Effect<EvaluationStrategyResult>;

export type EvaluationStrategy = {
  readonly id: string;
  readonly model: string;
  readonly finalizationModel?: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls?: boolean;
  readonly instructionsVersion: string;
  readonly instructions?: string;
  readonly tools: ReadonlyArray<string>;
  readonly maxModelTurns: number;
  readonly maxToolCalls: number;
  readonly maxConcurrentTools?: number;
  readonly maxDurationMs?: number;
  readonly softCostLimitUsd?: number;
  readonly hardCostLimitUsd?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly maxModelRetries?: number;
  readonly maxToolRetries?: number;
  readonly runner: EvaluationStrategyRunner;
};

export type EvaluationStrategyConfiguration = Omit<EvaluationStrategy, "runner">;

export type EvaluationResumeManifest = {
  readonly artifactVersion: "2";
  readonly harnessVersion: "your-shopper-eval-v3-local-sol-judge";
  readonly evaluationCase: EvaluationCase;
  readonly strategies: ReadonlyArray<EvaluationStrategyConfiguration>;
  readonly evaluator: EvaluationLLMConfiguration;
  readonly judge: EvaluationLLMConfiguration;
  readonly evaluationConfiguration: EvaluationRunConfiguration;
  readonly evaluationProtocolInstructions: string;
  readonly evaluationJudgeInstructions: string;
  readonly candidateVerificationConfiguration: {
    readonly summaryQuery: string;
    readonly textMaxCharacters: number;
    readonly maxAgeHours: number;
    readonly batchSize: number;
    readonly concurrency: number;
  };
};

export type EvaluationJudgment = {
  readonly ranking: ReadonlyArray<string>;
  readonly reliability: ReadonlyArray<{
    readonly outputId: string;
    readonly passes: boolean;
    readonly hardRequirements: ReadonlyArray<{
      readonly requirementIndex: number;
      readonly status: "verified" | "unknown" | "failed";
      readonly evidence: string;
    }>;
    readonly concerns: ReadonlyArray<string>;
  }>;
  readonly rationale: string;
  readonly requiresHumanReview: boolean;
};

export type EvaluationArtifact = {
  readonly artifactVersion: "2";
  readonly timestamp: string;
  readonly resumeManifest: EvaluationResumeManifest;
  readonly resumeFingerprint: string;
  readonly evaluationCase: EvaluationCase;
  readonly protocol: EvaluationProtocol;
  readonly evaluator: EvaluationLLMRun<EvaluationProtocol>;
  readonly judge: EvaluationLLMRun<EvaluationJudgment>;
  readonly randomSeed: number;
  readonly evaluationConfiguration: EvaluationRunConfiguration;
  readonly strategy: Omit<EvaluationStrategy, "runner">;
  readonly result: EvaluationStrategyResult;
  readonly candidates: ReadonlyArray<EvaluationCandidate>;
  readonly verification: CandidateVerification;
};

export type ComparisonArtifact = {
  readonly artifactVersion: "2";
  readonly timestamp: string;
  readonly resumeManifest: EvaluationResumeManifest;
  readonly resumeFingerprint: string;
  readonly evaluationCase: EvaluationCase;
  readonly protocol: EvaluationProtocol;
  readonly evaluator: EvaluationLLMRun<EvaluationProtocol>;
  readonly judge: EvaluationLLMRun<EvaluationJudgment>;
  readonly randomSeed: number;
  readonly evaluationConfiguration: EvaluationRunConfiguration;
  readonly strategies: ReadonlyArray<EvaluationStrategyConfiguration>;
  readonly outputs: ReadonlyArray<{
    readonly outputId: string;
    readonly strategyId: string;
    readonly result: EvaluationStrategyResult;
  }>;
  readonly candidates: ReadonlyArray<EvaluationCandidate>;
  readonly verification: CandidateVerification;
  readonly judgment: EvaluationJudgment;
};

export type EvaluationRunConfiguration = {
  readonly strategyConcurrency: number;
  readonly maxVerificationCandidates: number;
};

export type EvaluationCheckpoint = {
  readonly artifactVersion: "2";
  readonly resumeManifest: EvaluationResumeManifest;
  readonly resumeFingerprint: string;
  readonly stage: "protocol" | "strategies" | "verification" | "complete";
  readonly evaluationCase: EvaluationCase;
  readonly randomSeed: number;
  readonly evaluationConfiguration: EvaluationRunConfiguration;
  readonly evaluator?: EvaluationLLMRun<EvaluationProtocol>;
  readonly strategyResults?: ReadonlyArray<{
    readonly strategyId: string;
    readonly result: EvaluationStrategyResult;
  }>;
  readonly candidates?: ReadonlyArray<EvaluationCandidate>;
  readonly verification?: CandidateVerification;
  readonly comparison?: ComparisonArtifact;
};
