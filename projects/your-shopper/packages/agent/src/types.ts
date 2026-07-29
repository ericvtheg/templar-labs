import type { AgentRun, AgentStatus, AgentUsage } from "@templar/agent";

export type ShopperCitation = {
  readonly url: string;
  readonly title?: string;
};

export type ShopperOutcome =
  | { readonly kind: "question"; readonly text: string; readonly data?: unknown }
  | {
      readonly kind: "answer";
      readonly text: string;
      readonly data?: unknown;
      readonly citations: ReadonlyArray<ShopperCitation>;
    };

export type ShopperRun = {
  readonly id: string;
  readonly status: AgentStatus;
  readonly outcome?: ShopperOutcome;
  readonly usage: AgentUsage;
  readonly agentRun: AgentRun;
};

export type StartShoppingInput = {
  readonly intent: string;
  readonly context?: string;
  readonly runId?: string;
};

export type ContinueShoppingInput = {
  readonly run: ShopperRun;
  readonly message: string;
};

export type ShopperAgent = {
  readonly start: (input: StartShoppingInput) => import("effect").Effect.Effect<ShopperRun>;
  readonly continue: (input: ContinueShoppingInput) => import("effect").Effect.Effect<ShopperRun>;
};
