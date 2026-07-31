import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exactModels, makeLLM } from "@templar/llm";
import { makeWebSearch } from "@templar/web-search";
import { Effect } from "effect";
import { writeComparisonArtifacts, writeEvaluationCheckpoint } from "./artifacts.ts";
import { developmentCases } from "./cases/development/index.ts";
import { codexEvaluationModel, makeCodexEvaluationLLM } from "./codex-evaluator.ts";
import { compareStrategies } from "./compare.ts";
import { comparisonReport } from "./report.ts";
import { evaluationResumeFingerprint, evaluationResumeManifest } from "./resume.ts";
import {
  disciplinedAgentStrategy,
  exaAgentStrategy,
  genericAgentStrategy,
  legacyShopperStrategy,
  openRouterSearchStrategy,
  yourShopperStrategy,
} from "./strategies/index.ts";
import type {
  ComparisonArtifact,
  EvaluationCase,
  EvaluationCheckpoint,
  EvaluationResumeManifest,
  EvaluationStrategy,
} from "./types.ts";

const cliArguments = process.argv.slice(2);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const candidateModel = option("--model") ?? exactModels.minimaxM3;
const finalizationModel = option("--finalization-model") ?? exactModels.gpt56Luna;
const evaluatorTimeoutMs = integerOption("--evaluator-timeout-ms", 180_000);
const evaluatorConfiguration = {
  backend: "codex-cli-chatgpt",
  model: codexEvaluationModel,
  reasoning: { effort: "high" },
  maxDurationMs: evaluatorTimeoutMs,
} as const;
const judgeConfiguration = evaluatorConfiguration;

rejectRemoteEvaluatorOptions();

if (cliArguments.includes("--list")) {
  printList();
} else {
  await runSelected();
}

async function runSelected(): Promise<void> {
  const openRouterApiKey = requiredEnvironment("OPENROUTER_API_TOKEN");
  const exaApiKey = requiredEnvironment("EXA_API_KEY");
  const llm = makeLLM({
    apiKey: openRouterApiKey,
    appName: "Your Shopper Evaluation",
    siteUrl: "https://templarlabs.com",
  });
  const evaluatorLLM = makeCodexEvaluationLLM();
  const webSearch = makeWebSearch({ apiKey: exaApiKey });
  const ownedOptions = {
    llm,
    webSearch,
    model: candidateModel,
    finalizationModel,
    reasoning: { effort: "high" },
    maxModelTurns: 8,
    maxToolCalls: 12,
    maxConcurrentTools: integerOption("--tool-concurrency", 2),
    maxDurationMs: integerOption("--agent-timeout-ms", 240_000),
    softCostLimitUsd: 0.12,
    hardCostLimitUsd: 0.2,
  };
  const availableStrategies = [
    yourShopperStrategy(ownedOptions),
    genericAgentStrategy(ownedOptions),
    disciplinedAgentStrategy(ownedOptions),
    legacyShopperStrategy(ownedOptions),
    openRouterSearchStrategy({
      llm,
      model: candidateModel,
      reasoning: { effort: "high" },
      engine: "parallel",
      maxUses: 3,
      maxResults: 5,
      maxTotalResults: 15,
      maxCharacters: 2_000,
      maxDurationMs: 120_000,
    }),
    exaAgentStrategy({
      apiKey: exaApiKey,
      effort: "medium",
      maxDurationMs: integerOption("--exa-agent-timeout-ms", 180_000),
    }),
  ];
  const strategies = selectStrategies(availableStrategies);
  const cases = selectCases();
  const maxVerificationCandidates = integerOption("--max-verification-candidates", 24);
  const strategyConcurrency = integerOption("--strategy-concurrency", 1);
  const maxRunCostUsd = numberOption("--max-run-cost", 2);
  const evaluationConfiguration = { strategyConcurrency, maxVerificationCandidates };
  const resumeIdentities = new Map<string, ResumeIdentity>(
    cases.map((evaluationCase) => {
      const manifest = evaluationResumeManifest({
        evaluationCase,
        strategies,
        evaluator: evaluatorConfiguration,
        judge: judgeConfiguration,
        evaluationConfiguration,
      });
      return [
        evaluationCase.id,
        { manifest, fingerprint: evaluationResumeFingerprint(manifest) },
      ] as const;
    }),
  );
  const resumeDirectory = option("--resume");
  const runDirectory =
    resumeDirectory === undefined
      ? fileURLToPath(
          new URL(`./artifacts/${new Date().toISOString().replaceAll(":", "-")}`, import.meta.url),
        )
      : resolve(repositoryRoot, resumeDirectory);
  const existing = await loadComparisons(runDirectory, resumeIdentities);
  const checkpoints = await loadCheckpoints(runDirectory);
  const comparisons = cases.flatMap((evaluationCase) => {
    const comparison = existing.get(evaluationCase.id);
    return comparison === undefined ? [] : [comparison];
  });
  let recordedRunCostUsd = comparisons.reduce(
    (sum, comparison) => sum + comparisonCostUsd(comparison),
    0,
  );
  for (const evaluationCase of cases) {
    if (existing.has(evaluationCase.id)) {
      console.log(`Reusing completed ${evaluationCase.id}`);
      continue;
    }
    if (recordedRunCostUsd >= maxRunCostUsd) {
      console.log(
        "Stopping before the next case because the recorded run-cost ceiling was reached.",
      );
      break;
    }
    const resumeCheckpoint = checkpoints.get(evaluationCase.id);
    const resumeIdentity = resumeIdentities.get(evaluationCase.id) as ResumeIdentity;
    if (resumeCheckpoint !== undefined) {
      validateCheckpoint(resumeCheckpoint, evaluationCase, resumeIdentity);
      console.log(`Resuming ${evaluationCase.id} from ${resumeCheckpoint.stage} checkpoint`);
    }
    const randomSeed = resumeCheckpoint?.randomSeed ?? Math.floor(Math.random() * 0x1_0000_0000);
    console.log(
      `Running ${evaluationCase.id} against ${strategies.map(({ id }) => id).join(", ")}`,
    );
    // oxlint-disable-next-line no-await-in-loop -- Cases are serialized to bound paid evaluation work.
    const comparison = await Effect.runPromise(
      compareStrategies({
        evaluationCase,
        strategies,
        evaluatorLLM,
        evaluator: evaluatorConfiguration,
        judge: judgeConfiguration,
        webSearch,
        randomSeed,
        maxVerificationCandidates,
        strategyConcurrency,
        ...(resumeCheckpoint === undefined ? {} : { resumeCheckpoint }),
        onCheckpoint: (checkpoint) =>
          writeEvaluationCheckpoint({
            directory: runDirectory,
            caseId: evaluationCase.id,
            checkpoint,
          }),
      }),
    );
    comparisons.push(comparison);
    // oxlint-disable-next-line no-await-in-loop -- Persist each paid result before starting another case.
    await writeComparisonArtifacts({ directory: runDirectory, comparison, strategies });
    recordedRunCostUsd += comparisonCostUsd(comparison);
    console.log(
      `Completed ${evaluationCase.id}; recorded run cost $${recordedRunCostUsd.toFixed(4)} / $${maxRunCostUsd.toFixed(4)}`,
    );
    if (recordedRunCostUsd >= maxRunCostUsd) {
      console.log(
        "Stopping before the next case because the recorded run-cost ceiling was reached.",
      );
      break;
    }
  }
  await mkdir(runDirectory, { recursive: true });
  await writeFile(`${runDirectory}/report.md`, comparisonReport(comparisons), "utf8");
  console.log(`Saved ${comparisons.length} comparison(s) to ${runDirectory}`);
}

async function loadCheckpoints(directory: string): Promise<Map<string, EvaluationCheckpoint>> {
  const checkpoints = new Map<string, EvaluationCheckpoint>();
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isMissingDirectory(error)) {
      return checkpoints;
    }
    throw error;
  }
  const loaded = await Promise.all(
    entries
      .filter((name) => name.endsWith(".checkpoint.json"))
      .toSorted()
      .map(
        async (entry) =>
          JSON.parse(await readFile(resolve(directory, entry), "utf8")) as EvaluationCheckpoint,
      ),
  );
  for (const checkpoint of loaded) {
    checkpoints.set(checkpoint.evaluationCase.id, checkpoint);
  }
  return checkpoints;
}

type ResumeIdentity = {
  readonly manifest: EvaluationResumeManifest;
  readonly fingerprint: string;
};

function validateCheckpoint(
  checkpoint: EvaluationCheckpoint,
  evaluationCase: EvaluationCase,
  expected: ResumeIdentity,
): void {
  if (checkpoint.evaluationCase.id !== evaluationCase.id) {
    throw new Error(`Checkpoint case mismatch for ${evaluationCase.id}.`);
  }
  validateResumeIdentity(
    checkpoint.resumeManifest,
    checkpoint.resumeFingerprint,
    expected,
    `checkpoint for ${evaluationCase.id}`,
  );
  if (
    checkpoint.comparison !== undefined &&
    checkpoint.comparison.resumeFingerprint !== expected.fingerprint
  ) {
    throw new Error(`Completed checkpoint comparison mismatch for ${evaluationCase.id}.`);
  }
}

async function loadComparisons(
  directory: string,
  expectedByCase: ReadonlyMap<string, ResumeIdentity>,
): Promise<Map<string, ComparisonArtifact>> {
  const comparisons = new Map<string, ComparisonArtifact>();
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isMissingDirectory(error)) {
      return comparisons;
    }
    throw error;
  }
  const loaded = await Promise.all(
    entries
      .filter((name) => name.endsWith(".comparison.json"))
      .toSorted()
      .map(async (entry) => ({
        entry,
        comparison: JSON.parse(
          await readFile(resolve(directory, entry), "utf8"),
        ) as ComparisonArtifact,
      })),
  );
  for (const { entry, comparison } of loaded) {
    const expected = expectedByCase.get(comparison.evaluationCase.id);
    if (expected === undefined) {
      continue;
    }
    validateResumeIdentity(
      comparison.resumeManifest,
      comparison.resumeFingerprint,
      expected,
      entry,
    );
    comparisons.set(comparison.evaluationCase.id, comparison);
  }
  return comparisons;
}

function validateResumeIdentity(
  manifest: EvaluationResumeManifest,
  fingerprint: string,
  expected: ResumeIdentity,
  label: string,
): void {
  if (
    manifest?.artifactVersion !== "2" ||
    evaluationResumeFingerprint(manifest) !== fingerprint ||
    evaluationResumeFingerprint(expected.manifest) !== expected.fingerprint ||
    fingerprint !== expected.fingerprint
  ) {
    throw new Error(
      `Cannot resume ${label}: the case or effective strategy, evaluator, judge, or verification configuration changed.`,
    );
  }
}

function isMissingDirectory(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}

function selectCases(): ReadonlyArray<EvaluationCase> {
  if (cliArguments.includes("--all")) {
    return developmentCases;
  }
  const requested = option("--cases")?.split(",").filter(Boolean) ?? option("--case")?.split(",");
  if (requested === undefined) {
    throw new Error(
      "Choose --case <id>, --cases <id,id>, use --all intentionally, or pass --list.",
    );
  }
  const selected = developmentCases.filter(({ id }) => requested.includes(id));
  const missing = requested.filter((id) => !selected.some((candidate) => candidate.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown evaluation cases: ${missing.join(", ")}`);
  }
  return selected;
}

function selectStrategies(
  available: ReadonlyArray<EvaluationStrategy>,
): ReadonlyArray<EvaluationStrategy> {
  const requested = option("--strategy")?.split(",").filter(Boolean);
  if (requested === undefined) {
    return available.filter(({ id }) =>
      ["your-shopper", "generic-owned-agent", "disciplined-generic-agent"].includes(id),
    );
  }
  if (requested.includes("exa-agent") && !cliArguments.includes("--allow-exa-agent")) {
    throw new Error("Exa Agent is expensive. Pass --allow-exa-agent to opt in explicitly.");
  }
  const selected = available.filter((strategy) => requested.includes(strategy.id));
  const missing = requested.filter((id) => !selected.some((strategy) => strategy.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown strategies: ${missing.join(", ")}`);
  }
  return selected;
}

function integerOption(name: string, fallback: number): number {
  const value = numberOption(name, fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function numberOption(name: string, fallback: number): number {
  const raw = option(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return value;
}

function comparisonCostUsd(comparison: ComparisonArtifact): number {
  return [
    ...comparison.outputs.map(({ result }) => result.usage.totalCostUsd),
    comparison.evaluator.result.usage?.costUsd,
    ...comparison.evaluator.failedAttempts.map(({ usage }) => usage?.costUsd),
    comparison.judge.result.usage?.costUsd,
    ...comparison.judge.failedAttempts.map(({ usage }) => usage?.costUsd),
    comparison.verification.costUsd,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function option(name: string): string | undefined {
  const index = cliArguments.indexOf(name);
  return index < 0 ? undefined : cliArguments[index + 1];
}

function rejectRemoteEvaluatorOptions(): void {
  const removed = ["--evaluator-model", "--judge-model"].filter((name) =>
    cliArguments.includes(name),
  );
  if (removed.length > 0) {
    throw new Error(
      `${removed.join(", ")} is not supported. Evaluation protocols and judgments are always produced locally by ${codexEvaluationModel} through the authenticated Codex CLI.`,
    );
  }
}

function requiredEnvironment(name: string): string {
  // biome-ignore lint/style/noProcessEnv: This opt-in CLI entry point owns environment configuration.
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function printList(): void {
  console.log("Cases:");
  for (const evaluationCase of developmentCases) {
    console.log(`  ${evaluationCase.id} (${evaluationCase.track})`);
  }
  console.log("Strategies:");
  console.log("  your-shopper");
  console.log("  generic-owned-agent");
  console.log("  disciplined-generic-agent");
  console.log("  legacy-shopper-v1");
  console.log("  openrouter-search-agent (explicit production-alternative benchmark)");
  console.log("  exa-agent (requires --allow-exa-agent)");
  console.log("Exact model options:");
  for (const model of Object.values(exactModels)) {
    console.log(`  ${model}`);
  }
  console.log(`Default candidate model: ${candidateModel}`);
  console.log(`Finalization model: ${finalizationModel}`);
  console.log(`Protocol model: ${codexEvaluationModel} (local Codex CLI only)`);
  console.log(`Judge model: ${codexEvaluationModel} (local Codex CLI only)`);
}
