import { describe, expect, test } from "vitest";
import { computeParticipantBalances, simplifySettlementRecommendations } from "./balances.ts";
import { calculateExpenseSplits, SplitValidationError } from "./split-math.ts";

const participants = [{ id: "alice" }, { id: "bea" }, { id: "cam" }];

describe("calculateExpenseSplits", () => {
  test("computes equal splits in cents", () => {
    expect(
      calculateExpenseSplits({
        amountCents: 1200,
        method: "equal",
        participantIds: ["alice", "bea", "cam"],
      }),
    ).toEqual([
      { participantId: "alice", amountCents: 400, percentageBasisPoints: null },
      { participantId: "bea", amountCents: 400, percentageBasisPoints: null },
      { participantId: "cam", amountCents: 400, percentageBasisPoints: null },
    ]);
  });

  test("keeps equal split rounding stable", () => {
    expect(
      calculateExpenseSplits({
        amountCents: 1000,
        method: "equal",
        participantIds: ["alice", "bea", "cam"],
      }).map((split) => split.amountCents),
    ).toEqual([334, 333, 333]);
  });

  test("accepts exact amount splits that equal the total", () => {
    expect(
      calculateExpenseSplits({
        amountCents: 1800,
        method: "exact",
        splits: [
          { participantId: "alice", amountCents: 1000 },
          { participantId: "bea", amountCents: 500 },
          { participantId: "cam", amountCents: 300 },
        ],
      }),
    ).toEqual([
      { participantId: "alice", amountCents: 1000, percentageBasisPoints: null },
      { participantId: "bea", amountCents: 500, percentageBasisPoints: null },
      { participantId: "cam", amountCents: 300, percentageBasisPoints: null },
    ]);
  });

  test("accepts exact amount splits within two dollars of the total", () => {
    expect(
      calculateExpenseSplits({
        amountCents: 1800,
        method: "exact",
        splits: [
          { participantId: "alice", amountCents: 1000 },
          { participantId: "bea", amountCents: 600 },
        ],
      }).map((split) => split.amountCents),
    ).toEqual([1000, 600]);
  });

  test("rejects exact amount splits that do not equal the total", () => {
    expect(() =>
      calculateExpenseSplits({
        amountCents: 1800,
        method: "exact",
        splits: [
          { participantId: "alice", amountCents: 1000 },
          { participantId: "bea", amountCents: 500 },
        ],
      }),
    ).toThrow("Increase the split sum by $3.00.");
  });

  test("computes percentage splits with cent rounding", () => {
    expect(
      calculateExpenseSplits({
        amountCents: 1000,
        method: "percentage",
        splits: [
          { participantId: "alice", percentageBasisPoints: 3333 },
          { participantId: "bea", percentageBasisPoints: 3333 },
          { participantId: "cam", percentageBasisPoints: 3334 },
        ],
      }),
    ).toEqual([
      { participantId: "alice", amountCents: 333, percentageBasisPoints: 3333 },
      { participantId: "bea", amountCents: 333, percentageBasisPoints: 3333 },
      { participantId: "cam", amountCents: 334, percentageBasisPoints: 3334 },
    ]);
  });

  test("rejects percentages that do not equal 100%", () => {
    expect(() =>
      calculateExpenseSplits({
        amountCents: 1000,
        method: "percentage",
        splits: [
          { participantId: "alice", percentageBasisPoints: 5000 },
          { participantId: "bea", percentageBasisPoints: 4000 },
        ],
      }),
    ).toThrow(SplitValidationError);
  });
});

describe("computeParticipantBalances", () => {
  test("excludes participants who are not split into an expense", () => {
    const splits = calculateExpenseSplits({
      amountCents: 1000,
      method: "equal",
      participantIds: ["alice", "bea"],
    });

    expect(
      computeParticipantBalances({
        participants,
        expenses: [{ amountCents: 1000, payerParticipantId: "alice", splits }],
        settlements: [],
      }),
    ).toEqual([
      { participantId: "alice", balanceCents: 500 },
      { participantId: "bea", balanceCents: -500 },
      { participantId: "cam", balanceCents: 0 },
    ]);
  });

  test("settlements reduce outstanding balances", () => {
    const splits = calculateExpenseSplits({
      amountCents: 1200,
      method: "equal",
      participantIds: ["alice", "bea", "cam"],
    });

    expect(
      computeParticipantBalances({
        participants,
        expenses: [{ amountCents: 1200, payerParticipantId: "alice", splits }],
        settlements: [{ fromParticipantId: "bea", toParticipantId: "alice", amountCents: 400 }],
      }),
    ).toEqual([
      { participantId: "alice", balanceCents: 400 },
      { participantId: "bea", balanceCents: 0 },
      { participantId: "cam", balanceCents: -400 },
    ]);
  });
});

describe("simplifySettlementRecommendations", () => {
  test("returns simplified debt recommendations", () => {
    expect(
      simplifySettlementRecommendations([
        { participantId: "alice", balanceCents: 900 },
        { participantId: "bea", balanceCents: -500 },
        { participantId: "cam", balanceCents: -400 },
      ]),
    ).toEqual([
      { fromParticipantId: "bea", toParticipantId: "alice", amountCents: 500 },
      { fromParticipantId: "cam", toParticipantId: "alice", amountCents: 400 },
    ]);
  });
});
