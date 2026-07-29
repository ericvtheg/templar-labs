import { Context, Effect, Layer } from "effect";
import { z } from "zod";
import type { LLMDriver } from "./driver.ts";
import { type LLMError, LLMParseError, LLMProviderError, LLMSchemaError } from "./errors.ts";
import { withLLMLogging } from "./logging.ts";
import { type LLMModelRoute, type TemplarModelTier, templarModelTiers } from "./models.ts";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTextResult,
  GenerateTurnInput,
  GenerateTurnResult,
  LLMStructuredOutput,
  ResolvedGenerateTurnInput,
} from "./types.ts";

type InternalGenerateTurnInput = GenerateTurnInput & {
  readonly structuredOutput?: LLMStructuredOutput;
};

export type LLMService = {
  readonly generateTurn: (input: GenerateTurnInput) => Effect.Effect<GenerateTurnResult, LLMError>;
  readonly generateText: (input: GenerateTextInput) => Effect.Effect<GenerateTextResult, LLMError>;
  readonly generateObject: <S extends z.ZodType>(
    input: GenerateObjectInput<S>,
  ) => Effect.Effect<GenerateObjectResult<z.output<S>>, LLMError>;
};

export type LLMServiceConfig = {
  readonly driver: LLMDriver;
};

export class LLM extends Context.Tag("@templar/llm/LLM")<LLM, LLMService>() {
  static readonly generateTurn = Effect.serviceFunctionEffect(this, (ai) => ai.generateTurn);
  static readonly generateText = Effect.serviceFunctionEffect(this, (ai) => ai.generateText);
  static readonly generateObject = Effect.serviceFunctionEffect(this, (ai) => ai.generateObject);
}

export function makeLLMLayer(service: LLMService): Layer.Layer<LLM> {
  return Layer.succeed(LLM, service);
}

export function makeLLMService(config: LLMServiceConfig): LLMService {
  const generateTurn = (input: InternalGenerateTurnInput) =>
    config.driver.generateTurn(resolveInput(input)).pipe(
      withLLMLogging({
        provider: config.driver.provider,
        operation: "generateTurn",
        model: resolveInput(input).model,
      }),
    );

  const generateText = (input: GenerateTextInput) =>
    Effect.flatMap(generateTurn(input), (result) => {
      if (result.text === undefined) {
        return Effect.fail(
          new LLMProviderError({
            provider: result.provider,
            operation: "generateText",
            model: result.model,
            message: "LLM response did not include text content.",
            cause: result.raw,
          }),
        );
      }
      return Effect.succeed(textResult(result));
    }).pipe(
      withLLMLogging({
        provider: config.driver.provider,
        operation: "generateText",
      }),
    );

  return {
    generateTurn,
    generateText,
    generateObject: <S extends z.ZodType>(input: GenerateObjectInput<S>) =>
      Effect.flatMap(structuredOutputFromSchema(input), (structuredOutput) =>
        Effect.flatMap(
          generateTurn(turnInputFromObjectInput(input, structuredOutput)),
          (turnResult) =>
            Effect.flatMap(requireText(turnResult), (result) =>
              Effect.map(
                parseObject(input, result),
                (value): GenerateObjectResult<z.output<S>> => ({
                  value,
                  ...result,
                }),
              ),
            ),
        ),
      ).pipe(
        withLLMLogging({
          provider: config.driver.provider,
          operation: "generateObject",
        }),
      ),
  };
}

function resolveInput(input: InternalGenerateTurnInput): ResolvedGenerateTurnInput {
  const modelRoute = resolveModelRoute(input.model);
  return {
    ...input,
    model: modelRoute.primary,
    ...(modelRoute.fallbacks === undefined || modelRoute.fallbacks.length === 0
      ? {}
      : { fallbackModels: modelRoute.fallbacks }),
  };
}

function resolveModelRoute(selector: GenerateTurnInput["model"]): LLMModelRoute {
  if (selector === undefined) {
    return templarModelTiers.balanced;
  }
  return isTemplarModelTier(selector) ? templarModelTiers[selector] : { primary: selector };
}

function isTemplarModelTier(selector: string): selector is TemplarModelTier {
  return Object.hasOwn(templarModelTiers, selector);
}

function structuredOutputFromSchema<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
): Effect.Effect<LLMStructuredOutput, LLMSchemaError> {
  return Effect.try({
    try: () => ({
      name: "response",
      schema: z.toJSONSchema(input.schema) as Record<string, unknown>,
      strict: true,
    }),
    catch: (cause) =>
      new LLMSchemaError({
        operation: "generateObject",
        message: "Failed to convert Zod schema to JSON Schema.",
        cause,
      }),
  });
}

function turnInputFromObjectInput<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
  structuredOutput: LLMStructuredOutput,
): InternalGenerateTurnInput {
  const { schema: _schema, ...turnInput } = input;
  return { ...turnInput, structuredOutput };
}

function requireText(
  result: GenerateTurnResult,
): Effect.Effect<GenerateTextResult, LLMProviderError> {
  return result.text === undefined
    ? Effect.fail(
        new LLMProviderError({
          provider: result.provider,
          operation: "generateObject",
          model: result.model,
          message: "LLM response did not include text content.",
          cause: result.raw,
        }),
      )
    : Effect.succeed(textResult(result));
}

function textResult(result: GenerateTurnResult): GenerateTextResult {
  return {
    text: result.text as string,
    model: result.model,
    provider: result.provider,
    ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }),
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(result.raw === undefined ? {} : { raw: result.raw }),
  };
}

function parseObject<S extends z.ZodType>(
  input: GenerateObjectInput<S>,
  result: GenerateTextResult,
): Effect.Effect<z.output<S>, LLMParseError> {
  return Effect.try({
    try: () => input.schema.parse(JSON.parse(result.text) as unknown),
    catch: (cause) =>
      new LLMParseError({
        operation: "generateObject",
        model: result.model,
        provider: result.provider,
        text: result.text,
        ...(result.usage === undefined ? {} : { usage: result.usage }),
        ...(result.raw === undefined ? {} : { raw: result.raw }),
        message: "Failed to parse LLM response as JSON.",
        cause,
      }),
  });
}
