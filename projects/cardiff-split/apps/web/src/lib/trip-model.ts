import {
  computeParticipantBalances,
  type SettlementRecommendation,
  simplifySettlementRecommendations,
} from "./balances.ts";

export type Participant = {
  readonly id: string;
  readonly name: string;
  readonly avatarType: "emoji" | "initials";
  readonly avatarValue: string;
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ExpenseSplit = {
  readonly id: string;
  readonly participantId: string;
  readonly amountCents: number;
  readonly percentageBasisPoints: number | null;
};

export type Expense = {
  readonly id: string;
  readonly title: string;
  readonly amountCents: number;
  readonly payerParticipantId: string;
  readonly expenseDate: string;
  readonly splitMethod: "equal" | "exact" | "percentage";
  readonly splits: readonly ExpenseSplit[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Settlement = {
  readonly id: string;
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly amountCents: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ActivityEvent = {
  readonly id: string;
  readonly actorLabel: string;
  readonly eventType: "created" | "edited" | "deleted" | "settled";
  readonly entityType: "trip" | "participant" | "expense" | "settlement";
  readonly entityId: string;
  readonly summary: string;
  readonly metadataJson: string;
  readonly createdAt: string;
};

export type TripSnapshot = {
  readonly trip: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly currency: "USD";
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly participants: readonly Participant[];
  readonly expenses: readonly Expense[];
  readonly settlements: readonly Settlement[];
  readonly activityEvents: readonly ActivityEvent[];
  readonly balances: readonly {
    readonly participantId: string;
    readonly balanceCents: number;
  }[];
  readonly settlementRecommendations: readonly SettlementRecommendation[];
  readonly totalSpentCents: number;
};

export function summarizeTrip(input: {
  readonly trip: TripSnapshot["trip"];
  readonly participants: readonly Participant[];
  readonly expenses: readonly Expense[];
  readonly settlements: readonly Settlement[];
  readonly activityEvents: readonly ActivityEvent[];
}): TripSnapshot {
  const balances = computeParticipantBalances({
    participants: input.participants,
    expenses: input.expenses,
    settlements: input.settlements,
  });
  const settlementRecommendations = simplifySettlementRecommendations(balances);
  const totalSpentCents = input.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  return {
    ...input,
    balances,
    settlementRecommendations,
    totalSpentCents,
  };
}

export function participantNameById(
  participants: readonly Participant[],
  participantId: string,
): string {
  return participants.find((participant) => participant.id === participantId)?.name ?? "Someone";
}
