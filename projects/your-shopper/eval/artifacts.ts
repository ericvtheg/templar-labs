import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ComparisonArtifact,
  EvaluationArtifact,
  EvaluationCheckpoint,
  EvaluationStrategy,
} from "./types.ts";

export async function writeComparisonArtifacts(input: {
  readonly directory: string;
  readonly comparison: ComparisonArtifact;
  readonly strategies: ReadonlyArray<EvaluationStrategy>;
}): Promise<void> {
  await mkdir(input.directory, { recursive: true });
  const byId = new Map(input.strategies.map((strategy) => [strategy.id, strategy]));
  const artifactWrites = input.comparison.outputs.flatMap((output) => {
    const strategy = byId.get(output.strategyId);
    if (strategy === undefined) {
      return [];
    }
    const { runner: _runner, ...configuration } = strategy;
    const artifact: EvaluationArtifact = {
      artifactVersion: "2",
      timestamp: input.comparison.timestamp,
      resumeManifest: input.comparison.resumeManifest,
      resumeFingerprint: input.comparison.resumeFingerprint,
      evaluationCase: input.comparison.evaluationCase,
      protocol: input.comparison.protocol,
      evaluator: input.comparison.evaluator,
      judge: input.comparison.judge,
      randomSeed: input.comparison.randomSeed,
      evaluationConfiguration: input.comparison.evaluationConfiguration,
      strategy: configuration,
      result: output.result,
      candidates: input.comparison.candidates,
      verification: input.comparison.verification,
    };
    return [
      writeJson(
        join(input.directory, `${input.comparison.evaluationCase.id}.${strategy.id}.json`),
        artifact,
      ),
    ];
  });
  await Promise.all([
    ...artifactWrites,
    writeJson(
      join(input.directory, `${input.comparison.evaluationCase.id}.comparison.json`),
      input.comparison,
    ),
  ]);
}

export async function writeEvaluationCheckpoint(input: {
  readonly directory: string;
  readonly caseId: string;
  readonly checkpoint: EvaluationCheckpoint;
}): Promise<void> {
  await mkdir(input.directory, { recursive: true });
  await writeJson(join(input.directory, `${input.caseId}.checkpoint.json`), input.checkpoint);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
