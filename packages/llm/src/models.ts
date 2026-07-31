export type LLMModelRoute = {
  readonly primary: string;
  readonly fallbacks?: ReadonlyArray<string>;
};

/** Exact provider model IDs suitable for reproducible runs and eval matrices. */
export const exactModels = {
  deepSeekV4Flash: "deepseek/deepseek-v4-flash-0731",
  qwen37Flash: "qwen/qwen3.7-flash",
  qwen36Flash: "qwen/qwen3.6-flash",
  minimaxM3: "minimax/minimax-m3",
  glm52: "z-ai/glm-5.2",
  gpt56Luna: "openai/gpt-5.6-luna",
  gpt56Sol: "openai/gpt-5.6-sol",
} as const;

export type ExactModel = (typeof exactModels)[keyof typeof exactModels];

/**
 * Free or zero-cost models for development and non-critical work.
 *
 * Use this for local development, CI smoke tests, demo environments,
 * experiments, and best-effort fallback behavior where correctness and
 * availability are not critical. Free models can be rate-limited, unavailable,
 * or lower quality than paid endpoints, so avoid this for production workflows
 * where a user is waiting on a dependable answer.
 */
export const freeModel: LLMModelRoute = {
  primary: "openrouter/free",
};

/**
 * General-purpose production model with a strong cost bias.
 *
 * Use this for routine app intelligence, user-facing generation, structured
 * output, lightweight reasoning, coding, and other production work that does
 * not justify automatic routing or frontier pricing. This is the package's
 * default tier.
 */
export const balancedModel: LLMModelRoute = {
  primary: exactModels.deepSeekV4Flash,
};

/**
 * OpenRouter-managed, task-aware model selection.
 *
 * Use this when the best model depends on the request and variable cost is
 * acceptable. The OpenRouter driver explicitly configures Auto Beta with a
 * cost-quality tradeoff of 9 so routing remains strongly cost-biased.
 */
export const autoModel: LLMModelRoute = {
  primary: "openrouter/auto-beta",
};

/**
 * Highest-quality single-shot models where cost is justified.
 *
 * Use this for executive-facing content, high-stakes analysis, complex
 * customer-facing answers, human-reviewed legal/financial/medical-adjacent
 * summarization, or escalation when cheaper tiers produce low confidence.
 * This tier should be opt-in because it can get expensive quickly.
 */
export const frontierModel: LLMModelRoute = {
  primary: exactModels.gpt56Sol,
  fallbacks: ["anthropic/claude-opus-5", "~google/gemini-pro-latest"],
};

export const templarModelTiers = {
  free: freeModel,
  balanced: balancedModel,
  auto: autoModel,
  frontier: frontierModel,
} as const satisfies Record<string, LLMModelRoute>;

export type TemplarModelTier = keyof typeof templarModelTiers;
