import type { z } from "zod";
import type { TemplarModelTier } from "./models.ts";

export type AIMessageRole = "system" | "user" | "assistant";

export type AIMessage = {
  readonly role: AIMessageRole;
  readonly content: string;
};

export type AIJsonSchema = Readonly<Record<string, unknown>>;

export type AIStructuredOutput = {
  readonly name: string;
  readonly schema: AIJsonSchema;
  readonly strict: boolean;
};

export type AIUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly costUsd?: number;
};

export type GenerateTextInput = {
  readonly model?: TemplarModelTier;
  readonly messages: ReadonlyArray<AIMessage>;
  readonly temperature?: number;
  readonly maxTokens?: number;
};

export type ResolvedGenerateTextInput = Omit<GenerateTextInput, "model"> & {
  readonly model: string;
  readonly fallbackModels?: ReadonlyArray<string>;
  readonly structuredOutput?: AIStructuredOutput;
};

export type GenerateTextResult = {
  readonly text: string;
  readonly model: string;
  readonly provider: string;
  readonly finishReason?: string;
  readonly usage?: AIUsage;
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
  readonly usage?: AIUsage;
  readonly raw?: unknown;
};
