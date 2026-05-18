import { Effect } from "effect";
import type { AIDriver } from "../driver.ts";
import { AIProviderError, AIRateLimitError } from "../errors.ts";
import { type AIService, makeAILayer, makeAIService } from "../service.ts";
import type { AIUsage, GenerateTextResult, ResolvedGenerateTextInput } from "../types.ts";

export type OpenRouterFetch = typeof fetch;

const openRouterBaseUrl = "https://openrouter.ai/api/v1";

export type OpenRouterAIOptions = {
  readonly apiKey: string;
  readonly appName?: string;
  readonly siteUrl?: string;
  readonly defaultHeaders?: Record<string, string>;
  readonly fetch?: OpenRouterFetch;
};

type OpenRouterChatResponse = {
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly finish_reason?: string | null;
    readonly message?: {
      readonly content?: string | null;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
    readonly cost?: number;
    readonly total_cost?: number;
  };
};

type OpenRouterErrorResponse = {
  readonly error?: {
    readonly message?: string;
    readonly code?: string | number;
  };
};

export function makeOpenRouterAI(options: OpenRouterAIOptions): AIService {
  return makeAIService({
    driver: createOpenRouterDriver(options),
  });
}

export const makeAI = makeOpenRouterAI;

export function openRouterAILayer(options: OpenRouterAIOptions) {
  return makeAILayer(makeOpenRouterAI(options));
}

export const aiLayer = openRouterAILayer;

function createOpenRouterDriver(config: OpenRouterAIOptions): AIDriver {
  const headers = {
    ...(config.siteUrl === undefined ? {} : { "HTTP-Referer": config.siteUrl }),
    ...(config.appName === undefined ? {} : { "X-Title": config.appName }),
  };

  return {
    provider: "openrouter",
    generateText: (request) =>
      generateOpenRouterText({
        apiKey: config.apiKey,
        ...(config.defaultHeaders === undefined ? {} : { defaultHeaders: config.defaultHeaders }),
        ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
        headers,
        request,
      }),
  };
}

function generateOpenRouterText(input: {
  readonly apiKey: string;
  readonly defaultHeaders?: Record<string, string>;
  readonly fetch?: OpenRouterFetch;
  readonly headers?: Record<string, string>;
  readonly request: ResolvedGenerateTextInput;
}): Effect.Effect<GenerateTextResult, AIProviderError | AIRateLimitError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const fetchImpl = input.fetch ?? fetch;
      const response = await fetchImpl(`${openRouterBaseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
          ...input.defaultHeaders,
          ...input.headers,
        },
        body: JSON.stringify(openRouterChatCompletionBody(input.request)),
      });

      if (!response.ok) {
        throw await openRouterHttpError(input.request.model, response);
      }

      const raw = (await response.json()) as OpenRouterChatResponse;
      const choice = raw.choices?.[0];
      const text = choice?.message?.content;

      if (typeof text !== "string") {
        throw new AIProviderError({
          provider: "openrouter",
          operation: "generateText",
          model: input.request.model,
          message: "OpenRouter response did not include text content.",
          cause: raw,
        });
      }

      return {
        text,
        model: raw.model ?? input.request.model,
        provider: "openrouter",
        ...(choice?.finish_reason === undefined || choice.finish_reason === null
          ? {}
          : { finishReason: choice.finish_reason }),
        ...(raw.usage === undefined ? {} : { usage: normalizeOpenRouterUsage(raw.usage) }),
        raw,
      };
    },
    catch: (cause) =>
      cause instanceof AIProviderError || cause instanceof AIRateLimitError
        ? cause
        : new AIProviderError({
            provider: "openrouter",
            operation: "generateText",
            model: input.request.model,
            message: "OpenRouter request failed.",
            cause,
          }),
  });
}

function openRouterChatCompletionBody(input: ResolvedGenerateTextInput): Record<string, unknown> {
  return {
    model: input.model,
    ...(input.fallbackModels === undefined ? {} : { models: input.fallbackModels }),
    messages: input.messages,
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
    ...(input.structuredOutput === undefined
      ? {}
      : {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.structuredOutput.name,
              strict: input.structuredOutput.strict,
              schema: input.structuredOutput.schema,
            },
          },
        }),
  };
}

async function openRouterHttpError(
  model: string,
  response: Response,
): Promise<AIProviderError | AIRateLimitError> {
  const requestId =
    response.headers.get("x-request-id") ?? response.headers.get("cf-ray") ?? undefined;
  const body = await readOpenRouterErrorBody(response);
  const message = body.error?.message ?? `OpenRouter returned HTTP ${response.status}.`;
  const errorInput = {
    provider: "openrouter",
    operation: "generateText" as const,
    model,
    status: response.status,
    message,
    ...(requestId === undefined ? {} : { requestId }),
    cause: body,
  };

  return response.status === 429
    ? new AIRateLimitError(errorInput)
    : new AIProviderError(errorInput);
}

async function readOpenRouterErrorBody(response: Response): Promise<OpenRouterErrorResponse> {
  try {
    return (await response.json()) as OpenRouterErrorResponse;
  } catch (cause) {
    return {
      error: {
        message: cause instanceof Error ? cause.message : "Failed to parse OpenRouter error body.",
      },
    };
  }
}

function normalizeOpenRouterUsage(usage: NonNullable<OpenRouterChatResponse["usage"]>): AIUsage {
  return {
    ...(usage.prompt_tokens === undefined ? {} : { inputTokens: usage.prompt_tokens }),
    ...(usage.completion_tokens === undefined ? {} : { outputTokens: usage.completion_tokens }),
    ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
    ...(usage.cost === undefined && usage.total_cost === undefined
      ? {}
      : { costUsd: usage.cost ?? usage.total_cost }),
  };
}
