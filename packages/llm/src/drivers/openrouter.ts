import { Effect } from "effect";
import type { LLMDriver } from "../driver.ts";
import { LLMProviderError, LLMRateLimitError } from "../errors.ts";
import { type LLMService, makeLLMLayer, makeLLMService } from "../service.ts";
import type {
  GenerateTurnResult,
  LLMMessage,
  LLMToolCall,
  LLMUsage,
  ResolvedGenerateTurnInput,
} from "../types.ts";

export type OpenRouterFetch = typeof fetch;

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const openRouterAutoBetaModel = "openrouter/auto-beta";
const openRouterAutoRouterCostQualityTradeoff = 9;

export type OpenRouterLLMOptions = {
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
      readonly tool_calls?: ReadonlyArray<OpenRouterToolCall>;
      readonly reasoning?: unknown;
      readonly reasoning_details?: unknown;
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

type OpenRouterToolCall = {
  readonly id?: unknown;
  readonly function?: { readonly name?: unknown; readonly arguments?: unknown };
};

type OpenRouterErrorResponse = {
  readonly error?: {
    readonly message?: string;
    readonly code?: string | number;
  };
};

export function makeOpenRouterLLM(options: OpenRouterLLMOptions): LLMService {
  return makeLLMService({ driver: createOpenRouterDriver(options) });
}

export const makeLLM = makeOpenRouterLLM;

export function openRouterLLMLayer(options: OpenRouterLLMOptions) {
  return makeLLMLayer(makeOpenRouterLLM(options));
}

export const llmLayer = openRouterLLMLayer;

function createOpenRouterDriver(config: OpenRouterLLMOptions): LLMDriver {
  const headers = {
    ...(config.siteUrl === undefined ? {} : { "HTTP-Referer": config.siteUrl }),
    ...(config.appName === undefined ? {} : { "X-Title": config.appName }),
  };
  return {
    provider: "openrouter",
    generateTurn: (request) =>
      generateOpenRouterTurn({
        apiKey: config.apiKey,
        ...(config.defaultHeaders === undefined ? {} : { defaultHeaders: config.defaultHeaders }),
        ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
        headers,
        request,
      }),
  };
}

function generateOpenRouterTurn(input: {
  readonly apiKey: string;
  readonly defaultHeaders?: Record<string, string>;
  readonly fetch?: OpenRouterFetch;
  readonly headers?: Record<string, string>;
  readonly request: ResolvedGenerateTurnInput;
}): Effect.Effect<GenerateTurnResult, LLMProviderError | LLMRateLimitError> {
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
      if (choice?.message === undefined) {
        throw providerResponseError(
          input.request.model,
          "OpenRouter response had no message.",
          raw,
        );
      }
      const text = choice.message.content;
      const toolCalls = normalizeToolCalls(input.request.model, choice.message.tool_calls, raw);
      const assistantProviderData = openRouterAssistantProviderData(choice.message);
      if ((text === undefined || text === null) && toolCalls.length === 0) {
        throw providerResponseError(
          input.request.model,
          "OpenRouter response included neither text nor tool calls.",
          raw,
        );
      }
      return {
        ...(typeof text === "string" ? { text } : {}),
        toolCalls,
        model: raw.model ?? input.request.model,
        provider: "openrouter",
        ...(choice.finish_reason === undefined || choice.finish_reason === null
          ? {}
          : { finishReason: choice.finish_reason }),
        ...(raw.usage === undefined ? {} : { usage: normalizeOpenRouterUsage(raw.usage) }),
        ...(assistantProviderData === undefined ? {} : { assistantProviderData }),
        raw,
      };
    },
    catch: (cause) =>
      cause instanceof LLMProviderError || cause instanceof LLMRateLimitError
        ? cause
        : new LLMProviderError({
            provider: "openrouter",
            operation: "generateTurn",
            model: input.request.model,
            message: "OpenRouter request failed.",
            cause,
          }),
  });
}

function openRouterChatCompletionBody(input: ResolvedGenerateTurnInput): Record<string, unknown> {
  return {
    ...input.providerOptions,
    model: input.model,
    ...(input.fallbackModels === undefined ? {} : { models: input.fallbackModels }),
    ...(input.model === openRouterAutoBetaModel
      ? {
          plugins: [
            { id: "auto-router", cost_quality_tradeoff: openRouterAutoRouterCostQualityTradeoff },
          ],
        }
      : {}),
    messages: input.messages.map(openRouterMessage),
    ...(input.tools === undefined
      ? {}
      : {
          tools: input.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }),
    ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: input.toolChoice }),
    ...(input.parallelToolCalls === undefined
      ? {}
      : { parallel_tool_calls: input.parallelToolCalls }),
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

function openRouterMessage(message: LLMMessage): Record<string, unknown> {
  switch (message.role) {
    case "system":
    case "user":
      return message;
    case "assistant":
      return {
        ...message.providerData,
        role: "assistant",
        content: message.content ?? null,
        ...(message.toolCalls === undefined
          ? {}
          : {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.arguments },
              })),
            }),
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
  }
}

function openRouterAssistantProviderData(
  message: NonNullable<NonNullable<OpenRouterChatResponse["choices"]>[number]["message"]>,
): Readonly<Record<string, unknown>> | undefined {
  const data = {
    ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
    ...(message.reasoning_details === undefined
      ? {}
      : { reasoning_details: message.reasoning_details }),
  };
  return Object.keys(data).length === 0 ? undefined : data;
}

function normalizeToolCalls(
  model: string,
  value: ReadonlyArray<OpenRouterToolCall> | undefined,
  raw: unknown,
): ReadonlyArray<LLMToolCall> {
  if (value === undefined) {
    return [];
  }
  return value.map((call) => {
    if (
      typeof call.id !== "string" ||
      typeof call.function?.name !== "string" ||
      typeof call.function.arguments !== "string"
    ) {
      throw providerResponseError(model, "OpenRouter returned a malformed tool call.", raw);
    }
    return { id: call.id, name: call.function.name, arguments: call.function.arguments };
  });
}

function providerResponseError(model: string, message: string, cause: unknown): LLMProviderError {
  return new LLMProviderError({
    provider: "openrouter",
    operation: "generateTurn",
    model,
    message,
    cause,
  });
}

async function openRouterHttpError(
  model: string,
  response: Response,
): Promise<LLMProviderError | LLMRateLimitError> {
  const requestId =
    response.headers.get("x-request-id") ?? response.headers.get("cf-ray") ?? undefined;
  const body = await readOpenRouterErrorBody(response);
  const message = body.error?.message ?? `OpenRouter returned HTTP ${response.status}.`;
  const errorInput = {
    provider: "openrouter",
    operation: "generateTurn" as const,
    model,
    status: response.status,
    message,
    ...(requestId === undefined ? {} : { requestId }),
    cause: body,
  };
  return response.status === 429
    ? new LLMRateLimitError(errorInput)
    : new LLMProviderError(errorInput);
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

function normalizeOpenRouterUsage(usage: NonNullable<OpenRouterChatResponse["usage"]>): LLMUsage {
  return {
    ...(usage.prompt_tokens === undefined ? {} : { inputTokens: usage.prompt_tokens }),
    ...(usage.completion_tokens === undefined ? {} : { outputTokens: usage.completion_tokens }),
    ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
    ...(usage.cost === undefined && usage.total_cost === undefined
      ? {}
      : { costUsd: usage.cost ?? usage.total_cost }),
  };
}
