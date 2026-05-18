import { Context, Effect, Layer } from "effect";
import { z } from "zod";
import type { AIDriver } from "./driver.ts";
import { type AIError, AIParseError, AISchemaError, AIValidationError } from "./errors.ts";
import { withAILogging } from "./logging.ts";
import { type AIModelRoute, templarModelTiers } from "./models.ts";
import type {
  AIStructuredOutput,
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTextResult,
  ResolvedGenerateTextInput,
} from "./types.ts";

type InternalGenerateTextInput = GenerateTextInput & {
  readonly structuredOutput?: AIStructuredOutput;
};

export type AIService = {
  readonly generateText: (input: GenerateTextInput) => Effect.Effect<GenerateTextResult, AIError>;
  readonly generateObject: <S extends z.ZodType>(
    input: GenerateObjectInput<S>,
  ) => Effect.Effect<GenerateObjectResult<z.output<S>>, AIError>;
};

export type AIServiceConfig = {
  readonly driver: AIDriver;
};

export class AI extends Context.Tag("@templar/ai/AI")<AI, AIService>() {
  static readonly generateText = Effect.serviceFunctionEffect(this, (ai) => ai.generateText);
  static readonly generateObject = Effect.serviceFunctionEffect(this, (ai) => ai.generateObject);
}

export function makeAILayer(service: AIService): Layer.Layer<AI> {
  return Layer.succeed(AI, service);
}

export function makeAIService(config: AIServiceConfig): AIService {
  const generateText = (input: InternalGenerateTextInput) =>
    Effect.flatMap(resolveInput(input), (resolvedInput) =>
      config.driver.generateText(resolvedInput).pipe(
        withAILogging({
          provider: config.driver.provider,
          operation: "generateText",
          model: resolvedInput.model,
        }),
      ),
    );

  const service: AIService = {
    generateText,
    generateObject: <S extends z.ZodType>(input: GenerateObjectInput<S>) =>
      Effect.flatMap(structuredOutputFromSchema(input), (structuredOutput) =>
        Effect.flatMap(
          generateText(generateTextInputFromObjectInput(input, structuredOutput)),
          (result) =>
            Effect.map(parseObject(input, result), (value): GenerateObjectResult<z.output<S>> => {
              return {
                value,
                text: result.text,
                model: result.model,
                provider: result.provider,
                ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }),
                ...(result.usage === undefined ? {} : { usage: result.usage }),
                ...(result.raw === undefined ? {} : { raw: result.raw }),
              };
            }),
        ),
      ).pipe(
        withAILogging({
          provider: "service",
          operation: "generateObject",
        }),
      ),
  };

  return service;
}

function resolveInput(
  input: InternalGenerateTextInput,
): Effect.Effect<ResolvedGenerateTextInput, AIValidationError> {
  return Effect.flatMap(validateGenerateTextInput(input), () =>
    Effect.sync(() => {
      const modelRoute = resolveModelRoute(input.model);

      return {
        ...input,
        model: modelRoute.primary,
        ...(modelRoute.fallbacks === undefined || modelRoute.fallbacks.length === 0
          ? {}
          : { fallbackModels: modelRoute.fallbacks }),
      };
    }),
  );
}

function validateGenerateTextInput(
  input: GenerateTextInput,
): Effect.Effect<void, AIValidationError> {
  if (input.messages.length === 0) {
    return Effect.fail(
      new AIValidationError({
        field: "messages",
        message: "At least one message is required.",
      }),
    );
  }

  const invalidMessageIndex = input.messages.findIndex(
    (message) => message.content.trim().length === 0,
  );

  if (invalidMessageIndex >= 0) {
    return Effect.fail(
      new AIValidationError({
        field: `messages.${invalidMessageIndex}.content`,
        message: "Message content must not be empty.",
      }),
    );
  }

  return Effect.void;
}

function resolveModelRoute(selector: GenerateTextInput["model"]): AIModelRoute {
  return templarModelTiers[selector ?? "cheap"];
}

function structuredOutputFromSchema<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
): Effect.Effect<AIStructuredOutput, AISchemaError> {
  return Effect.try({
    try: () => ({
      name: "response",
      schema: z.toJSONSchema(input.schema) as Record<string, unknown>,
      strict: true,
    }),
    catch: (cause) =>
      new AISchemaError({
        operation: "generateObject",
        message: "Failed to convert Zod schema to JSON Schema.",
        cause,
      }),
  });
}

function generateTextInputFromObjectInput<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
  structuredOutput: AIStructuredOutput,
): InternalGenerateTextInput {
  const { schema: _schema, ...textInput } = input;

  return {
    ...textInput,
    structuredOutput,
  };
}

function parseObject<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
  result: GenerateTextResult,
): Effect.Effect<z.output<S>, AIParseError> {
  return Effect.try({
    try: () => {
      const parsed = JSON.parse(result.text) as unknown;

      return input.schema.parse(parsed);
    },
    catch: (cause) =>
      new AIParseError({
        operation: "generateObject",
        model: result.model,
        text: result.text,
        message: "Failed to parse AI response as JSON.",
        cause,
      }),
  });
}
