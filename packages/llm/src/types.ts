import type { z } from "zod";
import type { TemplarModelTier } from "./models.ts";

export type LLMModelSelector = TemplarModelTier | (string & {});

export type LLMToolCall = {
  readonly id: string;
  readonly name: string;
  /** Raw JSON text is preserved so the harness can validate or recover malformed arguments. */
  readonly arguments: string;
};

export type LLMSystemMessage = { readonly role: "system"; readonly content: string };
export type LLMUserMessage = { readonly role: "user"; readonly content: string };
export type LLMAssistantMessage = {
  readonly role: "assistant";
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<LLMToolCall>;
  /** Opaque provider-returned message fields that must be replayed unchanged on later turns. */
  readonly providerData?: Readonly<Record<string, unknown>>;
};
export type LLMToolResultMessage = {
  readonly role: "tool";
  readonly toolCallId: string;
  readonly name: string;
  readonly content: string;
};

export type LLMMessage =
  | LLMSystemMessage
  | LLMUserMessage
  | LLMAssistantMessage
  | LLMToolResultMessage;
export type LLMMessageRole = LLMMessage["role"];

export type LLMJsonSchema = Readonly<Record<string, unknown>>;

export type LLMToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: LLMJsonSchema;
};

export type LLMStructuredOutput = {
  readonly name: string;
  readonly schema: LLMJsonSchema;
  readonly strict: boolean;
};

export type LLMUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly costUsd?: number;
};

export type GenerateTurnInput = {
  readonly model?: LLMModelSelector;
  readonly messages: ReadonlyArray<LLMMessage>;
  readonly tools?: ReadonlyArray<LLMToolDefinition>;
  readonly reasoning?: unknown;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
};

export type ResolvedGenerateTurnInput = Omit<GenerateTurnInput, "model"> & {
  readonly model: string;
  readonly fallbackModels?: ReadonlyArray<string>;
  readonly structuredOutput?: LLMStructuredOutput;
};

export type GenerateTurnResult = {
  readonly text?: string;
  readonly toolCalls: ReadonlyArray<LLMToolCall>;
  readonly model: string;
  readonly provider: string;
  readonly finishReason?: string;
  readonly usage?: LLMUsage;
  /** Provider-native assistant state, such as OpenRouter reasoning details, for exact replay. */
  readonly assistantProviderData?: Readonly<Record<string, unknown>>;
  readonly raw?: unknown;
};

export type GenerateTextInput = Omit<
  GenerateTurnInput,
  "tools" | "toolChoice" | "parallelToolCalls"
>;

export type ResolvedGenerateTextInput = Omit<ResolvedGenerateTurnInput, "tools">;

export type GenerateTextResult = {
  readonly text: string;
  readonly model: string;
  readonly provider: string;
  readonly finishReason?: string;
  readonly usage?: LLMUsage;
  readonly raw?: unknown;
};

export type GenerateObjectInput<S extends z.ZodType = z.ZodType> = GenerateTextInput & {
  readonly schema: S;
};

export type GenerateObjectResult<A> = {
  readonly value: A;
  readonly text: string;
  readonly model: string;
  readonly provider: string;
  readonly finishReason?: string;
  readonly usage?: LLMUsage;
  readonly raw?: unknown;
};
