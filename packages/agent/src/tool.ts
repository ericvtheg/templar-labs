import type { Effect } from "effect";
import type { z } from "zod";
import type { AgentToolError } from "./errors.ts";

export type AgentToolContext = {
  readonly runId: string;
  readonly toolCallId: string;
  readonly attempt: number;
};

export type AgentToolResult = {
  readonly kind: "result";
  readonly value: unknown;
  readonly costUsd?: number;
  readonly raw?: unknown;
};

export type AgentToolSuspension = {
  readonly kind: "suspend";
  readonly request: unknown;
  readonly raw?: unknown;
};

export type AgentToolOutput = AgentToolResult | AgentToolSuspension;

export type AgentTool<S extends z.ZodType = z.ZodType> = {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
  readonly execute: (
    input: z.output<S>,
    context: AgentToolContext,
  ) => Effect.Effect<AgentToolOutput, AgentToolError>;
};

export function toolResult(
  value: unknown,
  options: { readonly costUsd?: number; readonly raw?: unknown } = {},
): AgentToolResult {
  return {
    kind: "result",
    value,
    ...(options.costUsd === undefined ? {} : { costUsd: options.costUsd }),
    ...(options.raw === undefined ? {} : { raw: options.raw }),
  };
}

export function suspendAgent(request: unknown, raw?: unknown): AgentToolSuspension {
  return { kind: "suspend", request, ...(raw === undefined ? {} : { raw }) };
}
