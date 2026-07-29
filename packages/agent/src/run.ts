import {
  type GenerateTurnInput,
  type GenerateTurnResult,
  type LLMError,
  type LLMMessage,
  LLMProviderError,
  LLMRateLimitError,
  type LLMToolCall,
} from "@templar/llm";
import { Effect, Option } from "effect";
import { z } from "zod";
import { reachedHardLimit, shouldForceSynthesis } from "./budget.ts";
import { AgentConfigurationError, type AgentFailure, AgentToolError } from "./errors.ts";
import type { AgentConfigSnapshot, AgentEvent, AgentEventInput } from "./events.ts";
import type { AgentTool, AgentToolOutput } from "./tool.ts";
import type { AgentModelTurnTrace, AgentToolCallTrace } from "./trace.ts";
import {
  type AgentConfig,
  type AgentOutcome,
  type AgentRun,
  type AgentService,
  type AgentStatus,
  type AgentUsage,
  addLLMUsage,
  addUsd,
  type ContinueAgentInput,
  emptyUsage,
  type StartAgentInput,
} from "./types.ts";

const synthesisInstruction =
  "Research is over and no tools are available. Do not call, describe, or encode a tool call, and do not say that you will verify one more fact. Return the best-supported final answer now from the evidence already collected, clearly noting uncertainty.";

const synthesisRetryInstruction =
  "Your previous synthesis attempted another tool call. Tools are unavailable. Write the final user-facing answer now using only the evidence already collected; do not emit tool-call syntax.";

type ResolvedAgentConfig = AgentConfig & {
  readonly maxConcurrentTools: number;
  readonly maxModelRetries: number;
  readonly maxToolRetries: number;
  readonly now: () => number;
  readonly createRunId: () => string;
};

type MutableRun = {
  readonly id: string;
  readonly startedAt: string;
  readonly startedMs: number;
  readonly initialMessages: ReadonlyArray<LLMMessage>;
  readonly messages: LLMMessage[];
  readonly events: AgentEvent[];
  readonly modelTurns: AgentModelTurnTrace[];
  readonly toolCalls: AgentToolCallTrace[];
  usage: AgentUsage;
  sequence: number;
  forceSynthesis: boolean;
  synthesisInstructionAdded: boolean;
  terminal: boolean;
  pendingToolCall?: LLMToolCall;
  outcome?: AgentOutcome;
  failure?: AgentFailure;
};

type ToolExecution = {
  readonly call: LLMToolCall;
  readonly trace: AgentToolCallTrace;
  readonly message?: LLMMessage;
  readonly suspension?: Extract<AgentToolOutput, { readonly kind: "suspend" }>;
  readonly failure?: AgentToolError;
  readonly costUsd: number;
};

export function makeAgent(input: AgentConfig): AgentService {
  const config = resolveConfig(input);
  const snapshot = configSnapshot(config);

  return {
    start: (startInput) => start(config, snapshot, startInput),
    continue: (continueInput) => continueRun(config, snapshot, continueInput),
  };
}

function start(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  input: StartAgentInput,
): Effect.Effect<AgentRun> {
  return Effect.suspend(() => {
    const startedMs = config.now();
    const initialMessages: ReadonlyArray<LLMMessage> = [
      { role: "system", content: config.instructions },
      ...input.messages,
    ];
    const state: MutableRun = {
      id: input.runId ?? config.createRunId(),
      startedAt: new Date(startedMs).toISOString(),
      startedMs,
      initialMessages,
      messages: [...initialMessages],
      events: [],
      modelTurns: [],
      toolCalls: [],
      usage: emptyUsage(),
      sequence: 0,
      forceSynthesis: false,
      synthesisInstructionAdded: false,
      terminal: false,
    };
    emit(config, state, { type: "run.started", config: snapshot });
    return runActive(config, snapshot, state);
  });
}

function continueRun(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  input: ContinueAgentInput,
): Effect.Effect<AgentRun> {
  return Effect.suspend(() => {
    const state = mutableFromRun(input.run, config);
    if (input.run.status !== "waiting_for_input" || input.run.pendingToolCall === undefined) {
      return Effect.succeed(
        failRun(config, snapshot, state, {
          code: "configuration",
          message: "Only a run waiting for tool input can be continued.",
        }),
      );
    }
    delete state.pendingToolCall;
    delete state.outcome;
    state.terminal = false;
    state.messages.push({
      role: "tool",
      toolCallId: input.run.pendingToolCall.id,
      name: input.run.pendingToolCall.name,
      content: jsonString(input.toolResult),
    });
    return runActive(config, snapshot, state);
  });
}

function runActive(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
): Effect.Effect<AgentRun> {
  const loop = runLoop(config, snapshot, state);
  const bounded =
    config.maxDurationMs === undefined
      ? loop
      : Effect.flatMap(
          loop.pipe(
            Effect.timeoutOption(Math.max(0, config.maxDurationMs - elapsed(config, state))),
          ),
          Option.match({
            onNone: () =>
              Effect.succeed(
                failRun(config, snapshot, state, {
                  code: "duration_limit",
                  message: "The agent duration limit was reached.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        );
  return withCancellation(config, state, snapshot, bounded);
}

function runLoop(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
): Effect.Effect<AgentRun> {
  return Effect.suspend(() => {
    const limit = reachedHardLimit({
      usage: state.usage,
      elapsedMs: elapsed(config, state),
      maxModelTurns: config.maxModelTurns,
      ...(config.maxDurationMs === undefined ? {} : { maxDurationMs: config.maxDurationMs }),
      ...(config.hardCostLimitUsd === undefined
        ? {}
        : { hardCostLimitUsd: config.hardCostLimitUsd }),
    });
    if (limit !== undefined) {
      return Effect.succeed(failForLimit(config, snapshot, state, limit));
    }

    const forceSynthesis =
      state.forceSynthesis ||
      state.usage.toolCalls >= config.maxToolCalls ||
      shouldForceSynthesis({
        usage: state.usage,
        maxModelTurns: config.maxModelTurns,
        ...(config.researchBudgetUsd === undefined
          ? {}
          : { researchBudgetUsd: config.researchBudgetUsd }),
      });
    if (forceSynthesis && !state.synthesisInstructionAdded) {
      state.messages.push({ role: "system", content: synthesisInstruction });
      state.synthesisInstructionAdded = true;
    }

    const request = modelRequest(config, snapshot, state, forceSynthesis);
    const turn = state.usage.modelTurns + 1;
    const turnStartedMs = config.now();
    const turnStartedAt = new Date(turnStartedMs).toISOString();
    emit(config, state, { type: "model.turn.started", turn });

    return generateModelTurn(config, request, 1).pipe(
      Effect.matchEffect({
        onFailure: (error) => {
          const durationMs = config.now() - turnStartedMs;
          state.modelTurns.push({
            turn,
            attempts: modelAttemptsForFailure(config, error),
            startedAt: turnStartedAt,
            durationMs,
            request,
            error,
          });
          return Effect.succeed(
            failRun(config, snapshot, state, {
              code: "model",
              message: "The model turn failed.",
              cause: error,
            }),
          );
        },
        onSuccess: ({ response, attempts }) =>
          handleModelResponse(
            config,
            snapshot,
            state,
            request,
            response,
            turn,
            turnStartedMs,
            turnStartedAt,
            forceSynthesis,
            attempts,
          ),
      }),
    );
  });
}

function handleModelResponse(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  request: GenerateTurnInput,
  response: GenerateTurnResult,
  turn: number,
  turnStartedMs: number,
  turnStartedAt: string,
  forceSynthesis: boolean,
  attempts: number,
): Effect.Effect<AgentRun> {
  const durationMs = config.now() - turnStartedMs;
  state.usage = addLLMUsage(state.usage, response.usage);
  state.modelTurns.push({
    turn,
    attempts,
    startedAt: turnStartedAt,
    durationMs,
    request,
    response,
  });
  emit(config, state, {
    type: "model.turn.completed",
    turn,
    model: response.model,
    durationMs,
    ...(response.usage === undefined ? {} : { usage: response.usage }),
    ...(response.finishReason === undefined ? {} : { finishReason: response.finishReason }),
  });

  if (
    config.hardCostLimitUsd !== undefined &&
    state.usage.totalCostUsd >= config.hardCostLimitUsd
  ) {
    return Effect.succeed(
      failRun(config, snapshot, state, {
        code: "hard_cost_limit",
        message: "The agent hard cost limit was reached.",
      }),
    );
  }

  if (forceSynthesis) {
    const invalidSynthesis =
      response.text === undefined ||
      response.toolCalls.length > 0 ||
      containsEncodedToolCall(response.text);
    if (invalidSynthesis && state.usage.modelTurns < config.maxModelTurns) {
      state.messages.push({ role: "system", content: synthesisRetryInstruction });
      return runLoop(config, snapshot, state);
    }
    return Effect.succeed(
      invalidSynthesis
        ? failRun(config, snapshot, state, {
            code: "model_turn_limit",
            message: "The forced final synthesis did not return a usable final answer.",
          })
        : completeRun(config, snapshot, state, response.text as string),
    );
  }

  if (response.toolCalls.length === 0) {
    return Effect.succeed(
      response.text === undefined
        ? failRun(config, snapshot, state, {
            code: "model",
            message: "The model returned neither tool calls nor final text.",
          })
        : completeRun(config, snapshot, state, response.text),
    );
  }

  state.messages.push({
    role: "assistant",
    ...(response.text === undefined ? {} : { content: response.text }),
    toolCalls: response.toolCalls,
    ...(response.assistantProviderData === undefined
      ? {}
      : { providerData: response.assistantProviderData }),
  });

  const remaining = Math.max(0, config.maxToolCalls - state.usage.toolCalls);
  const executable = response.toolCalls.slice(0, remaining);
  const rejected = response.toolCalls.slice(remaining);
  state.usage = { ...state.usage, toolCalls: state.usage.toolCalls + executable.length };

  return Effect.flatMap(
    Effect.all(
      executable.map((call) => executeToolCall(config, state, call)),
      {
        concurrency: config.maxConcurrentTools,
      },
    ),
    (executions) => {
      for (const execution of executions) {
        state.toolCalls.push(execution.trace);
        if (execution.message !== undefined) {
          state.messages.push(execution.message);
        }
      }
      const toolCostUsd = executions.reduce((sum, execution) => sum + execution.costUsd, 0);
      state.usage = {
        ...state.usage,
        toolCostUsd: addUsd(state.usage.toolCostUsd, toolCostUsd),
        totalCostUsd: addUsd(state.usage.totalCostUsd, toolCostUsd),
      };

      for (const call of rejected) {
        appendToolLimitResult(config, state, call);
      }
      if (rejected.length > 0) {
        state.forceSynthesis = true;
      }

      const fatal = executions.find((execution) => execution.failure?.recoverable === false);
      if (fatal?.failure !== undefined) {
        return Effect.succeed(
          failRun(config, snapshot, state, {
            code: "tool",
            message: `Tool ${fatal.call.name} failed and is not recoverable.`,
            cause: fatal.failure,
          }),
        );
      }

      const suspensions = executions.filter((execution) => execution.suspension !== undefined);
      if (suspensions.length > 1) {
        return Effect.succeed(
          failRun(config, snapshot, state, {
            code: "tool",
            message: "Multiple tools attempted to suspend the same model turn.",
          }),
        );
      }
      const suspended = suspensions[0];
      if (suspended?.suspension !== undefined) {
        return Effect.succeed(
          suspendRun(config, snapshot, state, suspended.call, suspended.suspension.request),
        );
      }

      state.forceSynthesis =
        state.forceSynthesis ||
        shouldForceSynthesis({
          usage: state.usage,
          maxModelTurns: config.maxModelTurns,
          ...(config.researchBudgetUsd === undefined
            ? {}
            : { researchBudgetUsd: config.researchBudgetUsd }),
        });
      return runLoop(config, snapshot, state);
    },
  );
}

function generateModelTurn(
  config: ResolvedAgentConfig,
  request: GenerateTurnInput,
  attempt: number,
): Effect.Effect<{ readonly response: GenerateTurnResult; readonly attempts: number }, LLMError> {
  return config.llm.generateTurn(request).pipe(
    Effect.map((response) => ({ response, attempts: attempt })),
    Effect.catchAll((error) =>
      isRetryableModelError(error) && attempt <= config.maxModelRetries
        ? Effect.sleep(1_000 * attempt).pipe(
            Effect.zipRight(generateModelTurn(config, request, attempt + 1)),
          )
        : Effect.fail(error),
    ),
  );
}

function isRetryableModelError(error: LLMError): boolean {
  return (
    error instanceof LLMRateLimitError ||
    (error instanceof LLMProviderError &&
      (error.status === undefined || error.status === 408 || error.status >= 500))
  );
}

function modelAttemptsForFailure(config: ResolvedAgentConfig, error: LLMError): number {
  return isRetryableModelError(error) ? config.maxModelRetries + 1 : 1;
}

function containsEncodedToolCall(text: string): boolean {
  return /<[^>]*(?:tool[_ -]?calls?|invoke)[^>]*>/iu.test(text);
}

function executeToolCall(
  config: ResolvedAgentConfig,
  state: MutableRun,
  call: LLMToolCall,
): Effect.Effect<ToolExecution> {
  const startedMs = config.now();
  const startedAt = new Date(startedMs).toISOString();
  emit(config, state, { type: "tool.call.started", callId: call.id, tool: call.name });
  const tool = config.tools.find((candidate) => candidate.name === call.name);
  if (tool === undefined) {
    return Effect.succeed(
      failedToolExecution(
        config,
        state,
        call,
        startedMs,
        startedAt,
        undefined,
        new AgentToolError({
          tool: call.name,
          code: "unknown_tool",
          message: `No tool named ${call.name} is registered.`,
          recoverable: true,
        }),
        0,
      ),
    );
  }

  const parsed = parseToolArguments(tool, call.arguments);
  if (!parsed.success) {
    return Effect.succeed(
      failedToolExecution(
        config,
        state,
        call,
        startedMs,
        startedAt,
        undefined,
        new AgentToolError({
          tool: call.name,
          code: "invalid_arguments",
          message: "Tool arguments did not match the tool schema.",
          recoverable: true,
          cause: parsed.error,
        }),
        0,
      ),
    );
  }

  return executeWithRetry(config, state, tool, call, parsed.value, 1).pipe(
    Effect.map(({ output, failure, attempts }) => {
      const durationMs = config.now() - startedMs;
      if (failure !== undefined) {
        return failedToolExecution(
          config,
          state,
          call,
          startedMs,
          startedAt,
          parsed.value,
          failure,
          attempts,
        );
      }
      const resolvedOutput = output as AgentToolOutput;
      emit(config, state, {
        type: "tool.call.completed",
        callId: call.id,
        tool: call.name,
        durationMs,
        ...(resolvedOutput.kind === "result" && resolvedOutput.costUsd !== undefined
          ? { costUsd: resolvedOutput.costUsd }
          : {}),
      });
      return {
        call,
        trace: {
          call,
          startedAt,
          durationMs,
          attempts,
          parsedInput: parsed.value,
          output: resolvedOutput,
        },
        ...(resolvedOutput.kind === "result"
          ? {
              message: {
                role: "tool" as const,
                toolCallId: call.id,
                name: call.name,
                content: jsonString(resolvedOutput.value),
              },
            }
          : { suspension: resolvedOutput }),
        costUsd:
          resolvedOutput.kind === "result" && resolvedOutput.costUsd !== undefined
            ? resolvedOutput.costUsd
            : 0,
      };
    }),
  );
}

function executeWithRetry(
  config: ResolvedAgentConfig,
  state: MutableRun,
  tool: AgentTool,
  call: LLMToolCall,
  input: unknown,
  attempt: number,
): Effect.Effect<{
  readonly output?: AgentToolOutput;
  readonly failure?: AgentToolError;
  readonly attempts: number;
}> {
  return tool.execute(input, { runId: state.id, toolCallId: call.id, attempt }).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        error.retryable === true && attempt <= config.maxToolRetries
          ? executeWithRetry(config, state, tool, call, input, attempt + 1)
          : Effect.succeed({ failure: error, attempts: attempt }),
      onSuccess: (output) => Effect.succeed({ output, attempts: attempt }),
    }),
  );
}

function failedToolExecution(
  config: ResolvedAgentConfig,
  state: MutableRun,
  call: LLMToolCall,
  startedMs: number,
  startedAt: string,
  parsedInput: unknown,
  error: AgentToolError,
  attempts: number,
): ToolExecution {
  const durationMs = config.now() - startedMs;
  emit(config, state, {
    type: "tool.call.failed",
    callId: call.id,
    tool: call.name,
    durationMs,
    code: error.code,
    recoverable: error.recoverable,
  });
  return {
    call,
    trace: {
      call,
      startedAt,
      durationMs,
      attempts,
      ...(parsedInput === undefined ? {} : { parsedInput }),
      error,
    },
    message: {
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: jsonString({
        error: {
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
          ...(error.cause === undefined ? {} : { details: safeErrorDetails(error.cause) }),
        },
      }),
    },
    failure: error,
    costUsd: 0,
  };
}

function appendToolLimitResult(
  config: ResolvedAgentConfig,
  state: MutableRun,
  call: LLMToolCall,
): void {
  const now = config.now();
  const error = new AgentToolError({
    tool: call.name,
    code: "tool_call_limit",
    message: "The agent tool-call limit has been reached.",
    recoverable: true,
  });
  emit(config, state, { type: "tool.call.started", callId: call.id, tool: call.name });
  const execution = failedToolExecution(
    config,
    state,
    call,
    now,
    new Date(now).toISOString(),
    undefined,
    error,
    0,
  );
  state.toolCalls.push(execution.trace);
  if (execution.message !== undefined) {
    state.messages.push(execution.message);
  }
}

function modelRequest(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  forceSynthesis: boolean,
): GenerateTurnInput {
  return {
    model: forceSynthesis ? (config.finalModel ?? config.model) : config.model,
    messages: [...state.messages],
    ...(forceSynthesis || snapshot.tools.length === 0 ? {} : { tools: snapshot.tools }),
    ...(config.reasoning === undefined ? {} : { reasoning: config.reasoning }),
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
    ...(forceSynthesis
      ? { toolChoice: "none" }
      : {
          ...(config.toolChoice === undefined ? {} : { toolChoice: config.toolChoice }),
          parallelToolCalls: config.parallelToolCalls ?? true,
        }),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    ...(config.providerOptions === undefined ? {} : { providerOptions: config.providerOptions }),
  };
}

function completeRun(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  text: string,
): AgentRun {
  state.outcome = { kind: "answer", text };
  state.terminal = true;
  emit(config, state, { type: "run.completed", durationMs: elapsed(config, state) });
  return immutableRun(config, snapshot, state, "completed");
}

function suspendRun(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  call: LLMToolCall,
  request: unknown,
): AgentRun {
  state.pendingToolCall = call;
  state.outcome = {
    kind: "suspension",
    toolCallId: call.id,
    toolName: call.name,
    request,
  };
  emit(config, state, { type: "run.waiting_for_input", request });
  return immutableRun(config, snapshot, state, "waiting_for_input");
}

function failForLimit(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  limit: "duration" | "hard_cost" | "model_turn",
): AgentRun {
  const failures = {
    duration: { code: "duration_limit", message: "The agent duration limit was reached." },
    hard_cost: { code: "hard_cost_limit", message: "The agent hard cost limit was reached." },
    model_turn: { code: "model_turn_limit", message: "The agent model-turn limit was reached." },
  } as const;
  return failRun(config, snapshot, state, failures[limit]);
}

function failRun(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  failure: AgentFailure,
): AgentRun {
  state.failure = failure;
  state.terminal = true;
  emit(config, state, { type: "run.failed", durationMs: elapsed(config, state), failure });
  return immutableRun(config, snapshot, state, "failed");
}

function immutableRun(
  config: ResolvedAgentConfig,
  snapshot: AgentConfigSnapshot,
  state: MutableRun,
  status: AgentStatus,
): AgentRun {
  const usage = { ...state.usage, durationMs: elapsed(config, state) };
  return {
    id: state.id,
    status,
    config: snapshot,
    messages: [...state.messages],
    events: [...state.events],
    trace: {
      initialMessages: [...state.initialMessages],
      modelTurns: [...state.modelTurns],
      toolCalls: [...state.toolCalls],
    },
    usage,
    ...(state.outcome === undefined ? {} : { outcome: state.outcome }),
    ...(state.failure === undefined ? {} : { failure: state.failure }),
    ...(state.pendingToolCall === undefined ? {} : { pendingToolCall: state.pendingToolCall }),
    startedAt: state.startedAt,
  };
}

function mutableFromRun(run: AgentRun, config: ResolvedAgentConfig): MutableRun {
  const resumedMs = config.now();
  return {
    id: run.id,
    startedAt: run.startedAt,
    startedMs: resumedMs - run.usage.durationMs,
    initialMessages: [...run.trace.initialMessages],
    messages: [...run.messages],
    events: [...run.events],
    modelTurns: [...run.trace.modelTurns],
    toolCalls: [...run.trace.toolCalls],
    usage: run.usage,
    sequence: run.events.at(-1)?.sequence ?? 0,
    forceSynthesis: false,
    synthesisInstructionAdded: run.messages.some(
      (message) => message.role === "system" && message.content === synthesisInstruction,
    ),
    terminal: false,
    ...(run.pendingToolCall === undefined ? {} : { pendingToolCall: run.pendingToolCall }),
    ...(run.outcome === undefined ? {} : { outcome: run.outcome }),
    ...(run.failure === undefined ? {} : { failure: run.failure }),
  };
}

function withCancellation(
  config: ResolvedAgentConfig,
  state: MutableRun,
  snapshot: AgentConfigSnapshot,
  effect: Effect.Effect<AgentRun>,
): Effect.Effect<AgentRun> {
  return effect.pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        if (state.terminal) {
          return;
        }
        state.terminal = true;
        emit(config, state, { type: "run.cancelled", durationMs: elapsed(config, state) });
        immutableRun(config, snapshot, state, "cancelled");
      }),
    ),
  );
}

function resolveConfig(input: AgentConfig): ResolvedAgentConfig {
  if (!Number.isInteger(input.maxModelTurns) || input.maxModelTurns < 1) {
    throw new AgentConfigurationError({
      field: "maxModelTurns",
      message: "maxModelTurns must be a positive integer.",
    });
  }
  if (!Number.isInteger(input.maxToolCalls) || input.maxToolCalls < 0) {
    throw new AgentConfigurationError({
      field: "maxToolCalls",
      message: "maxToolCalls must be a non-negative integer.",
    });
  }
  if (
    input.maxConcurrentTools !== undefined &&
    (!Number.isInteger(input.maxConcurrentTools) || input.maxConcurrentTools < 1)
  ) {
    throw new AgentConfigurationError({
      field: "maxConcurrentTools",
      message: "maxConcurrentTools must be a positive integer.",
    });
  }
  if (
    input.maxModelRetries !== undefined &&
    (!Number.isInteger(input.maxModelRetries) || input.maxModelRetries < 0)
  ) {
    throw new AgentConfigurationError({
      field: "maxModelRetries",
      message: "maxModelRetries must be a non-negative integer.",
    });
  }
  if (
    input.maxToolRetries !== undefined &&
    (!Number.isInteger(input.maxToolRetries) || input.maxToolRetries < 0)
  ) {
    throw new AgentConfigurationError({
      field: "maxToolRetries",
      message: "maxToolRetries must be a non-negative integer.",
    });
  }
  if (
    input.maxDurationMs !== undefined &&
    (!Number.isFinite(input.maxDurationMs) || input.maxDurationMs <= 0)
  ) {
    throw new AgentConfigurationError({
      field: "maxDurationMs",
      message: "maxDurationMs must be a finite positive number.",
    });
  }
  const names = input.tools.map((tool) => tool.name);
  if (new Set(names).size !== names.length) {
    throw new AgentConfigurationError({
      field: "tools",
      message: "Agent tool names must be unique.",
    });
  }
  return {
    ...input,
    maxConcurrentTools: input.maxConcurrentTools ?? 4,
    maxModelRetries: input.maxModelRetries ?? 0,
    maxToolRetries: input.maxToolRetries ?? 1,
    now: input.now ?? Date.now,
    createRunId: input.createRunId ?? (() => crypto.randomUUID()),
  };
}

function configSnapshot(config: ResolvedAgentConfig): AgentConfigSnapshot {
  try {
    return {
      model: config.model,
      ...(config.finalModel === undefined ? {} : { finalModel: config.finalModel }),
      ...(config.reasoning === undefined ? {} : { reasoning: config.reasoning }),
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config.toolChoice === undefined ? {} : { toolChoice: config.toolChoice }),
      parallelToolCalls: config.parallelToolCalls ?? true,
      instructions: config.instructions,
      instructionsVersion: config.instructionsVersion,
      maxModelTurns: config.maxModelTurns,
      maxToolCalls: config.maxToolCalls,
      maxConcurrentTools: config.maxConcurrentTools,
      ...(config.maxDurationMs === undefined ? {} : { maxDurationMs: config.maxDurationMs }),
      ...(config.researchBudgetUsd === undefined
        ? {}
        : { researchBudgetUsd: config.researchBudgetUsd }),
      ...(config.hardCostLimitUsd === undefined
        ? {}
        : { hardCostLimitUsd: config.hardCostLimitUsd }),
      ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
      ...(config.providerOptions === undefined ? {} : { providerOptions: config.providerOptions }),
      maxModelRetries: config.maxModelRetries,
      maxToolRetries: config.maxToolRetries,
      tools: config.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.schema) as Record<string, unknown>,
      })),
    };
  } catch (cause) {
    throw new AgentConfigurationError({
      field: "tools.schema",
      message: "Failed to convert a tool schema to JSON Schema.",
      cause,
    });
  }
}

function parseToolArguments(
  tool: AgentTool,
  text: string,
):
  | { readonly success: true; readonly value: unknown }
  | { readonly success: false; readonly error: unknown } {
  try {
    const value: unknown = JSON.parse(text);
    const result = tool.schema.safeParse(value);
    return result.success
      ? { success: true, value: result.data }
      : { success: false, error: result.error };
  } catch (error) {
    return { success: false, error };
  }
}

function jsonString(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    );
    return serialized ?? "null";
  } catch (cause) {
    return JSON.stringify({
      error: {
        code: "non_serializable_tool_result",
        message: "The tool result could not be serialized.",
        details: safeErrorDetails(cause),
      },
    });
  }
}

function safeErrorDetails(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message };
  }
  if (typeof cause === "object" && cause !== null && "issues" in cause) {
    return { issues: (cause as { readonly issues: unknown }).issues };
  }
  return String(cause);
}

function emit(config: ResolvedAgentConfig, state: MutableRun, event: AgentEventInput): void {
  const resolved = {
    ...event,
    runId: state.id,
    sequence: ++state.sequence,
    timestamp: new Date(config.now()).toISOString(),
  } as AgentEvent;
  state.events.push(resolved);
  try {
    config.onEvent?.(resolved);
  } catch {
    // Observability callbacks must not change agent behavior.
  }
}

function elapsed(config: ResolvedAgentConfig, state: MutableRun): number {
  return Math.max(0, config.now() - state.startedMs);
}
