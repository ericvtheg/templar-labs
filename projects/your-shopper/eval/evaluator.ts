import {
  type GenerateObjectResult,
  type LLMError,
  type LLMMessage,
  LLMParseError,
  LLMProviderError,
  type LLMService,
} from "@templar/llm";
import { Effect, Option } from "effect";
import { z } from "zod";
import type {
  EvaluationCase,
  EvaluationJudgment,
  EvaluationLLMConfiguration,
  EvaluationLLMRun,
  EvaluationProtocol,
  EvaluationStrategyResult,
} from "./types.ts";

const protocolSchema = z.object({
  likelyObjective: z.string(),
  hardRequirements: z.array(z.string()),
  valueDimensions: z.array(z.string()),
  materialFacts: z.array(z.string()),
  failureConditions: z.array(z.string()),
  meaningfulImprovement: z.string(),
  unknowns: z.array(z.string()),
});

export const evaluationProtocolInstructions =
  "Create a request-specific purchasing evaluation protocol before seeing any candidate strategy output. Separate hard requirements, value dimensions, evidence needs, failure conditions, meaningful improvement, and facts that cannot be known. For a request to find or buy a current product, listing, or service, include current acquisition feasibility as a hard requirement: an exact current seller or listing, sufficiently supported availability, and delivery or pickup compatible with the request. Treat a stated budget as total acquisition cost, including known shipping and mandatory fees, unless the request explicitly says item or list price only. Do not add arbitrary brand, certification, condition, warranty, or performance requirements that the request does not state or imply. Do not propose products. Return only the raw JSON object required by the response schema: no Markdown, headings, code fences, or commentary.";

export const evaluationJudgeInstructions =
  "Judge the blinded outputs using only the frozen protocol. Reliability gates come first: hard constraints, direct links, support for critical claims, availability uncertainty, and unknown facts presented as known. For clarification-track cases, a waiting_for_input output can pass when it asks one focused, necessary, user-knowable, decision-changing question and does not ask the user for a public fact; judge the question itself rather than requiring a recommendation. For research_decision and end_to_end cases, audit every indexed hard requirement for each output's primary recommendation as verified, unknown, or failed, and cite the evidence or gap briefly. A reliability pass is structurally impossible unless every hard requirement is verified. Waiting_for_input is substantively incomplete and cannot pass on those tracks. In every track, set reliability passes to false for a failed or substantively incomplete output, a hard-requirement violation, source fabrication or mismatch, or a materially unsupported decision claim. For a primary recommendation, an honestly disclosed unknown hard requirement still fails the reliability gate; a follow-up verification step or compliant backup does not rescue it. A delivered-total requirement is unknown when a material shipping charge is unknown. Do not treat statutory consumer complaint rights as a seller or manufacturer warranty. Useful partial work can still rank above a worse output without passing. Rank every output ID from best to worst. Include every output ID exactly once in ranking and exactly once in reliability. Explain the decision, and require human review for economically important, surprising, or weakly evidenced conclusions. Return only the raw JSON object required by the response schema: no Markdown, headings, code fences, or commentary.";

export function createEvaluationProtocol(
  llm: LLMService,
  configuration: EvaluationLLMConfiguration,
  evaluationCase: EvaluationCase,
): Effect.Effect<EvaluationLLMRun<EvaluationProtocol>, import("@templar/llm").LLMError> {
  return generateEvaluationObject(llm, configuration, protocolSchema, [
    {
      role: "system",
      content: evaluationProtocolInstructions,
    },
    { role: "user", content: JSON.stringify(evaluationCase) },
  ]);
}

export function judgeEvaluationOutputs(
  llm: LLMService,
  configuration: EvaluationLLMConfiguration,
  evaluationCase: EvaluationCase,
  protocol: EvaluationProtocol,
  outputs: ReadonlyArray<{ readonly outputId: string; readonly result: EvaluationStrategyResult }>,
  candidates: ReadonlyArray<{ readonly url: string; readonly title?: string }>,
  verification: import("./types.ts").CandidateVerification,
): Effect.Effect<EvaluationLLMRun<EvaluationJudgment>, import("@templar/llm").LLMError> {
  const outputIds = outputs.map(({ outputId }) => outputId);
  const auditedHardRequirements =
    evaluationCase.track === "clarification" ? [] : protocol.hardRequirements;
  return generateEvaluationObject(
    llm,
    configuration,
    judgmentSchema(outputIds, auditedHardRequirements.length),
    [
      {
        role: "system",
        content: evaluationJudgeInstructions,
      },
      {
        role: "user",
        content: JSON.stringify({
          expectedOutputIds: outputIds,
          evaluationTrack: evaluationCase.track,
          auditedHardRequirements: auditedHardRequirements.map((requirement, requirementIndex) => ({
            requirementIndex,
            requirement,
          })),
          protocol,
          outputs: outputs.map(({ outputId, result }) => ({
            outputId,
            status: result.status,
            output: result.output,
            citations: result.citations,
          })),
          candidates,
          verification: {
            status: verification.status,
            sources: verification.sources,
            ...(verification.failure === undefined ? {} : { failure: verification.failure }),
          },
        }),
      },
    ],
  );
}

function judgmentSchema(outputIds: ReadonlyArray<string>, hardRequirementCount: number) {
  const outputIdSet = new Set(outputIds);
  const requirementIndexes = new Set(
    Array.from({ length: hardRequirementCount }, (_value, index) => index),
  );
  return z
    .object({
      ranking: z.array(z.string()).length(outputIds.length),
      reliability: z
        .array(
          z.object({
            outputId: z.string(),
            passes: z.boolean(),
            hardRequirements: z
              .array(
                z.object({
                  requirementIndex: z.number().int().nonnegative(),
                  status: z.enum(["verified", "unknown", "failed"]),
                  evidence: z.string(),
                }),
              )
              .length(hardRequirementCount),
            concerns: z.array(z.string()),
          }),
        )
        .length(outputIds.length),
      rationale: z.string(),
      requiresHumanReview: z.boolean(),
    })
    .superRefine((judgment, context) => {
      requireExactOutputIds(judgment.ranking, "ranking", outputIdSet, context);
      requireExactOutputIds(
        judgment.reliability.map(({ outputId }) => outputId),
        "reliability",
        outputIdSet,
        context,
      );
      for (const [index, reliability] of judgment.reliability.entries()) {
        requireExactRequirementIndexes(
          reliability.hardRequirements.map(({ requirementIndex }) => requirementIndex),
          requirementIndexes,
          ["reliability", index, "hardRequirements"],
          context,
        );
        if (
          reliability.passes &&
          reliability.hardRequirements.some(({ status }) => status !== "verified")
        ) {
          context.addIssue({
            code: "custom",
            path: ["reliability", index, "passes"],
            message: "passes cannot be true unless every hard requirement is verified.",
            input: reliability.passes,
          });
        }
      }
    });
}

function requireExactRequirementIndexes(
  actual: ReadonlyArray<number>,
  expected: ReadonlySet<number>,
  path: ReadonlyArray<string | number>,
  context: z.core.$RefinementCtx<unknown>,
): void {
  if (new Set(actual).size === expected.size && actual.every((index) => expected.has(index))) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: [...path],
    message: "hardRequirements must contain every audited requirement index exactly once.",
    input: actual,
  });
}

function requireExactOutputIds(
  actual: ReadonlyArray<string>,
  field: "ranking" | "reliability",
  expected: ReadonlySet<string>,
  context: z.core.$RefinementCtx<unknown>,
): void {
  if (new Set(actual).size === expected.size && actual.every((id) => expected.has(id))) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: [field],
    message: `${field} must contain every expected output ID exactly once.`,
    input: actual,
  });
}

function generateEvaluationObject<S extends z.ZodType>(
  llm: LLMService,
  configuration: EvaluationLLMConfiguration,
  schema: S,
  messages: ReadonlyArray<LLMMessage>,
): Effect.Effect<EvaluationLLMRun<z.output<S>>, LLMError> {
  const started = Date.now();
  const generate = (attemptMessages: ReadonlyArray<LLMMessage>) =>
    generateWithTimeout(llm, configuration, schema, attemptMessages);
  return Effect.matchEffect(generate(messages), {
    onFailure: (error) => {
      if (!(error instanceof LLMParseError)) {
        return Effect.fail(error);
      }
      const failedAttempt = {
        model: error.model,
        ...(error.provider === undefined ? {} : { provider: error.provider }),
        text: error.text,
        ...(error.usage === undefined ? {} : { usage: error.usage }),
        ...(error.raw === undefined ? {} : { raw: error.raw }),
      };
      return Effect.map(
        generate([
          ...messages,
          { role: "assistant", content: error.text },
          {
            role: "user",
            content:
              "That response violated the required structured-output contract. Re-emit the same answer as one valid raw JSON object matching the response schema. Output JSON only, with no Markdown or code fences.",
          },
        ]),
        (result) => evaluationRun(configuration, result, [failedAttempt], started),
      );
    },
    onSuccess: (result) => Effect.succeed(evaluationRun(configuration, result, [], started)),
  });
}

function evaluationRun<A>(
  configuration: EvaluationLLMConfiguration,
  result: GenerateObjectResult<A>,
  failedAttempts: EvaluationLLMRun<A>["failedAttempts"],
  started: number,
): EvaluationLLMRun<A> {
  return { configuration, result, failedAttempts, durationMs: Date.now() - started };
}

function generateWithTimeout<S extends z.ZodType>(
  llm: LLMService,
  configuration: EvaluationLLMConfiguration,
  schema: S,
  messages: ReadonlyArray<LLMMessage>,
): Effect.Effect<GenerateObjectResult<z.output<S>>, LLMError> {
  const { maxDurationMs, ...llmConfiguration } = configuration;
  const generated = llm.generateObject({ ...llmConfiguration, messages, schema });
  if (maxDurationMs === undefined) {
    return generated;
  }
  return Effect.flatMap(
    generated.pipe(Effect.timeoutOption(maxDurationMs)),
    Option.match({
      onNone: () =>
        Effect.fail(
          new LLMProviderError({
            provider: "evaluation-harness",
            operation: "generateObject",
            model: configuration.model,
            message: `Evaluation model call exceeded ${maxDurationMs} ms.`,
          }),
        ),
      onSome: Effect.succeed,
    }),
  );
}
