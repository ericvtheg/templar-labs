export type BalanceParticipant = {
  readonly id: string;
};

export type BalanceExpense = {
  readonly amountCents: number;
  readonly payerParticipantId: string;
  readonly splits: readonly {
    readonly participantId: string;
    readonly amountCents: number;
  }[];
};

export type BalanceSettlement = {
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly amountCents: number;
};

export type ParticipantBalance = {
  readonly participantId: string;
  readonly balanceCents: number;
};

export type SettlementRecommendation = {
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly amountCents: number;
};

export function computeParticipantBalances(input: {
  readonly participants: readonly BalanceParticipant[];
  readonly expenses: readonly BalanceExpense[];
  readonly settlements: readonly BalanceSettlement[];
}): ParticipantBalance[] {
  const balances = new Map(input.participants.map((participant) => [participant.id, 0]));

  for (const expense of input.expenses) {
    addBalance(balances, expense.payerParticipantId, expense.amountCents);

    for (const split of expense.splits) {
      addBalance(balances, split.participantId, -split.amountCents);
    }
  }

  for (const settlement of input.settlements) {
    addBalance(balances, settlement.fromParticipantId, settlement.amountCents);
    addBalance(balances, settlement.toParticipantId, -settlement.amountCents);
  }

  return input.participants.map((participant) => ({
    participantId: participant.id,
    balanceCents: balances.get(participant.id) ?? 0,
  }));
}

export function simplifySettlementRecommendations(
  balances: readonly ParticipantBalance[],
): SettlementRecommendation[] {
  const peopleWhoShouldPay = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({
      participantId: balance.participantId,
      amountCents: -balance.balanceCents,
    }))
    .toSorted((a, b) => b.amountCents - a.amountCents);

  const peopleWhoShouldReceive = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({
      participantId: balance.participantId,
      amountCents: balance.balanceCents,
    }))
    .toSorted((a, b) => b.amountCents - a.amountCents);

  const recommendations: SettlementRecommendation[] = [];
  let payIndex = 0;
  let receiveIndex = 0;

  while (payIndex < peopleWhoShouldPay.length && receiveIndex < peopleWhoShouldReceive.length) {
    const payer = peopleWhoShouldPay[payIndex];
    const receiver = peopleWhoShouldReceive[receiveIndex];

    if (payer === undefined || receiver === undefined) {
      break;
    }

    const amountCents = Math.min(payer.amountCents, receiver.amountCents);

    if (amountCents > 0) {
      recommendations.push({
        fromParticipantId: payer.participantId,
        toParticipantId: receiver.participantId,
        amountCents,
      });
    }

    payer.amountCents -= amountCents;
    receiver.amountCents -= amountCents;

    if (payer.amountCents === 0) {
      payIndex += 1;
    }

    if (receiver.amountCents === 0) {
      receiveIndex += 1;
    }
  }

  return recommendations;
}

export function findMatchingSettlementRecommendation(
  recommendations: readonly SettlementRecommendation[],
  recommendation: SettlementRecommendation,
): SettlementRecommendation | undefined {
  return recommendations.find(
    (currentRecommendation) =>
      currentRecommendation.fromParticipantId === recommendation.fromParticipantId &&
      currentRecommendation.toParticipantId === recommendation.toParticipantId &&
      currentRecommendation.amountCents === recommendation.amountCents,
  );
}

function addBalance(balances: Map<string, number>, participantId: string, amountCents: number) {
  balances.set(participantId, (balances.get(participantId) ?? 0) + amountCents);
}
