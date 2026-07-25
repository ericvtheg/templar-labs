import { describe, expect, test } from "vitest";
import {
  type ActivityEvent,
  type Expense,
  type Participant,
  summarizeTrip,
} from "../src/lib/trip-model.ts";

const now = "2026-05-25T00:00:00.000Z";
const trip = {
  id: "trip",
  slug: "trip",
  name: "Trip",
  currency: "USD" as const,
  createdAt: now,
  updatedAt: now,
};
const activityEvents: ActivityEvent[] = [];

const participants: Participant[] = [
  {
    id: "alex",
    name: "Alex",
    avatarType: "initials",
    avatarValue: "A",
    color: "#126C5A",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "jordan",
    name: "Jordan",
    avatarType: "initials",
    avatarValue: "J",
    color: "#E76F51",
    createdAt: now,
    updatedAt: now,
  },
];

const expense: Expense = {
  id: "expense",
  title: "Dinner",
  amountCents: 1000,
  payerParticipantId: "alex",
  expenseDate: now,
  splitMethod: "equal",
  splits: [
    {
      id: "split-alex",
      participantId: "alex",
      amountCents: 500,
      percentageBasisPoints: null,
    },
    {
      id: "split-jordan",
      participantId: "jordan",
      amountCents: 500,
      percentageBasisPoints: null,
    },
  ],
  createdAt: now,
  updatedAt: now,
};

describe("summarizeTrip", () => {
  test("only counts unsettled balances as left to settle", () => {
    const snapshot = summarizeTrip({
      trip,
      participants,
      expenses: [expense],
      settlements: [],
      activityEvents,
    });

    expect(snapshot.totalSpentCents).toBe(1000);
    expect(snapshot.amountLeftToSettleCents).toBe(500);
  });

  test("shows zero left to settle for a fully settled expense", () => {
    const snapshot = summarizeTrip({
      trip,
      participants,
      expenses: [expense],
      settlements: [
        {
          id: "settlement",
          fromParticipantId: "jordan",
          toParticipantId: "alex",
          amountCents: 500,
          createdAt: now,
          updatedAt: now,
        },
      ],
      activityEvents,
    });

    expect(snapshot.totalSpentCents).toBe(1000);
    expect(snapshot.amountLeftToSettleCents).toBe(0);
  });
});
