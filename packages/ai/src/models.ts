export type AIModelRoute = {
  readonly primary: string;
  readonly fallbacks?: ReadonlyArray<string>;
};

/**
 * Free or zero-cost models for development and non-critical work.
 *
 * Use this for local development, CI smoke tests, demo environments,
 * experiments, and best-effort fallback behavior where correctness and
 * availability are not critical. Free models can be rate-limited, unavailable,
 * or lower quality than paid endpoints, so avoid this for production workflows
 * where a user is waiting on a dependable answer.
 */
export const freeModel: AIModelRoute = {
  primary: "deepseek/deepseek-v4-flash:free",
  fallbacks: ["nvidia/nemotron-3-super-120b-a12b:free", "openrouter/free"],
};

/**
 * Lowest-cost production models that are still surprisingly capable.
 *
 * Use this for high-volume, low-risk production work: ticket classification,
 * simple extraction, labels, titles, short summaries, lightweight chat,
 * background enrichment, and other tasks where occasional misses are tolerable.
 * This is the package's default tier because most routine app intelligence
 * should start cheap and escalate only when needed.
 */
export const cheapModel: AIModelRoute = {
  primary: "deepseek/deepseek-v4-flash",
  fallbacks: ["stepfun/step-3.5-flash", "tencent/hy3-preview"],
};

/**
 * General-purpose user-facing model tier with a stronger quality bias.
 *
 * Use this for visible summaries, drafting, moderate reasoning over app data,
 * multi-step instructions, structured output that the app depends on, and
 * workflows that should be reliable without paying frontier prices.
 */
export const balancedModel: AIModelRoute = {
  primary: "deepseek/deepseek-v4-pro",
  fallbacks: ["moonshotai/kimi-k2.6", "qwen/qwen3.6-max-preview"],
};

/**
 * Models selected for programming tasks.
 *
 * Use this for code generation, refactors, debugging, stack trace analysis,
 * migration drafting, PR summaries, small component generation, and diff
 * review. Coding gets a separate tier because programming model rankings and
 * tradeoffs often differ from general chat or summarization.
 */
export const codingModel: AIModelRoute = {
  primary: "moonshotai/kimi-k2.6",
  fallbacks: ["deepseek/deepseek-v4-pro", "qwen/qwen3.6-max-preview"],
};

/**
 * Models selected for constraint-heavy reasoning.
 *
 * Use this for planning, resolving conflicting requirements, operational
 * analysis, complex data interpretation, choosing implementation approaches,
 * and logic-heavy user requests. This is separate from coding because not all
 * reasoning tasks are programming tasks, and the best coding model is not
 * always the best planner or analyst.
 */
export const reasoningModel: AIModelRoute = {
  primary: "deepseek/deepseek-v4-pro",
  fallbacks: ["qwen/qwen3.6-max-preview", "moonshotai/kimi-k2-thinking"],
};

/**
 * Highest-quality single-shot models where cost is justified.
 *
 * Use this for executive-facing content, high-stakes analysis, complex
 * customer-facing answers, human-reviewed legal/financial/medical-adjacent
 * summarization, or escalation when cheaper tiers produce low confidence.
 * This tier should be opt-in because it can get expensive quickly.
 */
export const frontierModel: AIModelRoute = {
  primary: "openai/gpt-5.5",
  fallbacks: ["anthropic/claude-opus-4.7", "~google/gemini-pro-latest"],
};

/**
 * Models selected for long-running autonomous or semi-autonomous workflows.
 *
 * Use this for multi-file codebase changes, debugging across logs/tests/source,
 * end-to-end project planning, research tasks with multiple tool calls,
 * multi-stage cleanup, and workflows that need persistence over many turns.
 * This is separate from frontier because the best one-shot answer model is not
 * always the best agent model.
 */
export const agenticModel: AIModelRoute = {
  primary: "anthropic/claude-opus-4.7",
  fallbacks: ["openai/gpt-5.5", "moonshotai/kimi-k2.6"],
};

export const templarModelTiers = {
  free: freeModel,
  cheap: cheapModel,
  balanced: balancedModel,
  coding: codingModel,
  reasoning: reasoningModel,
  frontier: frontierModel,
  agentic: agenticModel,
} as const satisfies Record<string, AIModelRoute>;

export type TemplarModelTier = keyof typeof templarModelTiers;
