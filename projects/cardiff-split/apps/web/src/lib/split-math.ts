import { formatCurrency } from "./money.ts";

export type SplitMethod = "equal" | "exact" | "percentage";

export type ExpenseSplitAllocation = {
  readonly participantId: string;
  readonly amountCents: number;
  readonly percentageBasisPoints: number | null;
};

export type CalculateSplitInput =
  | {
      readonly amountCents: number;
      readonly method: "equal";
      readonly participantIds: readonly string[];
    }
  | {
      readonly amountCents: number;
      readonly method: "exact";
      readonly splits: readonly {
        readonly participantId: string;
        readonly amountCents: number;
      }[];
    }
  | {
      readonly amountCents: number;
      readonly method: "percentage";
      readonly splits: readonly {
        readonly participantId: string;
        readonly percentageBasisPoints: number;
      }[];
    };

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitValidationError";
  }
}

export const exactSplitToleranceCents = 200;

export function exactSplitMismatchMessage(totalCents: number, targetCents: number): string {
  const differenceCents = Math.abs(targetCents - totalCents);
  const direction = totalCents < targetCents ? "higher" : "lower";

  return `Exact split amounts must equal the expense total. The total sum needs to be ${formatCurrency(differenceCents)} ${direction}.`;
}

export function calculateExpenseSplits(input: CalculateSplitInput): ExpenseSplitAllocation[] {
  assertPositiveCents(input.amountCents, "Expense amount must be greater than $0.00.");

  switch (input.method) {
    case "equal":
      return calculateEqualSplits(input.amountCents, input.participantIds);
    case "exact":
      return calculateExactSplits(input.amountCents, input.splits);
    case "percentage":
      return calculatePercentageSplits(input.amountCents, input.splits);
  }
}

function calculateEqualSplits(
  amountCents: number,
  participantIds: readonly string[],
): ExpenseSplitAllocation[] {
  assertIncludedParticipants(participantIds);

  const baseAmount = Math.floor(amountCents / participantIds.length);
  const remainder = amountCents % participantIds.length;

  return participantIds.map((participantId, index) => ({
    participantId,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    percentageBasisPoints: null,
  }));
}

function calculateExactSplits(
  amountCents: number,
  splits: readonly {
    readonly participantId: string;
    readonly amountCents: number;
  }[],
): ExpenseSplitAllocation[] {
  assertIncludedParticipants(splits.map((split) => split.participantId));

  const total = splits.reduce((sum, split) => {
    assertNonNegativeCents(split.amountCents, "Exact split amounts cannot be negative.");
    return sum + split.amountCents;
  }, 0);

  if (Math.abs(total - amountCents) > exactSplitToleranceCents) {
    throw new SplitValidationError(exactSplitMismatchMessage(total, amountCents));
  }

  return splits.map((split) => ({
    participantId: split.participantId,
    amountCents: split.amountCents,
    percentageBasisPoints: null,
  }));
}

function calculatePercentageSplits(
  amountCents: number,
  splits: readonly {
    readonly participantId: string;
    readonly percentageBasisPoints: number;
  }[],
): ExpenseSplitAllocation[] {
  assertIncludedParticipants(splits.map((split) => split.participantId));

  const totalBasisPoints = splits.reduce((sum, split) => {
    if (!Number.isInteger(split.percentageBasisPoints) || split.percentageBasisPoints < 0) {
      throw new SplitValidationError("Percentages must be positive whole basis points.");
    }

    return sum + split.percentageBasisPoints;
  }, 0);

  if (totalBasisPoints !== 10_000) {
    throw new SplitValidationError("Percentages must equal 100%.");
  }

  const provisional = splits.map((split, index) => {
    const raw = amountCents * split.percentageBasisPoints;

    return {
      index,
      participantId: split.participantId,
      amountCents: Math.floor(raw / 10_000),
      percentageBasisPoints: split.percentageBasisPoints,
      remainder: raw % 10_000,
    };
  });

  const allocated = provisional.reduce((sum, split) => sum + split.amountCents, 0);
  let centsToAllocate = amountCents - allocated;
  const byLargestRemainder = provisional.toSorted((a, b) => {
    const remainderDiff = b.remainder - a.remainder;

    return remainderDiff === 0 ? a.index - b.index : remainderDiff;
  });

  for (const split of byLargestRemainder) {
    if (centsToAllocate <= 0) {
      break;
    }

    split.amountCents += 1;
    centsToAllocate -= 1;
  }

  return provisional
    .toSorted((a, b) => a.index - b.index)
    .map(({ participantId, amountCents: splitAmountCents, percentageBasisPoints }) => ({
      participantId,
      amountCents: splitAmountCents,
      percentageBasisPoints,
    }));
}

function assertIncludedParticipants(participantIds: readonly string[]) {
  if (participantIds.length === 0) {
    throw new SplitValidationError("At least one participant must be included.");
  }

  const uniqueParticipantIds = new Set(participantIds);

  if (uniqueParticipantIds.size !== participantIds.length) {
    throw new SplitValidationError("Each participant can only appear once in a split.");
  }
}

function assertPositiveCents(value: number, message: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SplitValidationError(message);
  }
}

function assertNonNegativeCents(value: number, message: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new SplitValidationError(message);
  }
}
