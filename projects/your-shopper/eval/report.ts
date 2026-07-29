import type { ComparisonArtifact } from "./types.ts";

export function comparisonReport(comparisons: ReadonlyArray<ComparisonArtifact>): string {
  const lines = [
    "# Your Shopper evaluation report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...summaryLines(comparisons),
    "",
    "## Cases",
    "",
    "| Case | Ranking | Human review | Total cost by output | Evaluation overhead |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const comparison of comparisons) {
    const strategyByOutput = new Map(
      comparison.outputs.map(({ outputId, strategyId }) => [outputId, strategyId]),
    );
    const costs = comparison.outputs
      .map(({ outputId, strategyId, result }) => {
        const cost = result.usage.totalCostUsd;
        return `${outputId} (${strategyId}): ${cost === undefined ? "unknown" : `$${cost.toFixed(4)}`}`;
      })
      .join("<br>");
    lines.push(
      `| ${comparison.evaluationCase.id} | ${comparison.judgment.ranking.map((outputId) => strategyByOutput.get(outputId) ?? outputId).join(" → ")} | ${comparison.judgment.requiresHumanReview ? "yes" : "no"} | ${costs} | ${formatUsd(evaluationCost(comparison))} |`,
    );
  }
  lines.push("", "## Case details", "");
  for (const comparison of comparisons) {
    lines.push(
      `### ${comparison.evaluationCase.id}`,
      "",
      comparison.judgment.rationale,
      "",
      `Pooled candidates: ${comparison.candidates.length}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function summaryLines(comparisons: ReadonlyArray<ComparisonArtifact>): ReadonlyArray<string> {
  const summaries = new Map<
    string,
    {
      cases: number;
      wins: number;
      rankTotal: number;
      reliabilityPasses: number;
      reliabilityRecorded: number;
      completed: number;
      costUsd: number;
    }
  >();
  for (const comparison of comparisons) {
    for (const output of comparison.outputs) {
      const summary = summaries.get(output.strategyId) ?? {
        cases: 0,
        wins: 0,
        rankTotal: 0,
        reliabilityPasses: 0,
        reliabilityRecorded: 0,
        completed: 0,
        costUsd: 0,
      };
      const rank = comparison.judgment.ranking.indexOf(output.outputId) + 1;
      const reliability = comparison.judgment.reliability.find(
        ({ outputId }) => outputId === output.outputId,
      );
      summary.cases += 1;
      summary.wins += rank === 1 ? 1 : 0;
      summary.rankTotal += rank;
      summary.reliabilityPasses += reliability?.passes === true ? 1 : 0;
      summary.reliabilityRecorded += reliability === undefined ? 0 : 1;
      summary.completed += output.result.status === "completed" ? 1 : 0;
      summary.costUsd += output.result.usage.totalCostUsd ?? 0;
      summaries.set(output.strategyId, summary);
    }
  }
  const totalEvaluationCost = comparisons.reduce(
    (sum, comparison) => sum + evaluationCost(comparison),
    0,
  );
  const totalStrategyCost = [...summaries.values()].reduce(
    (sum, summary) => sum + summary.costUsd,
    0,
  );
  const lines = [
    "## Summary",
    "",
    `Cases: ${comparisons.length}; recorded total cost: ${formatUsd(totalEvaluationCost + totalStrategyCost)} (${formatUsd(totalStrategyCost)} strategies + ${formatUsd(totalEvaluationCost)} evaluation).`,
    "",
    "| Strategy | Wins | Average rank | Reliability passes | Completed | Strategy cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [strategyId, summary] of [...summaries].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(
      `| ${strategyId} | ${summary.wins}/${summary.cases} | ${(summary.rankTotal / summary.cases).toFixed(2)} | ${summary.reliabilityPasses}/${summary.reliabilityRecorded} | ${summary.completed}/${summary.cases} | ${formatUsd(summary.costUsd)} |`,
    );
  }
  return lines;
}

function evaluationCost(comparison: ComparisonArtifact): number {
  const values = [
    comparison.evaluator.result.usage?.costUsd,
    ...comparison.evaluator.failedAttempts.map(({ usage }) => usage?.costUsd),
    comparison.judge.result.usage?.costUsd,
    ...comparison.judge.failedAttempts.map(({ usage }) => usage?.costUsd),
    comparison.verification.costUsd,
  ];
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}
