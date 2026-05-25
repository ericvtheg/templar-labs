import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, makeDatabase } from "@templar/db";
import { z } from "zod";
import * as schema from "../../../../db/schema.ts";
import {
  activityEvents,
  expenseSplits,
  expenses,
  participants,
  settlements,
  trips,
} from "../../../../db/schema.ts";
import { templarBindings } from "../../../../templar-bindings.ts";
import { formatCurrency } from "./money.ts";
import { calculateExpenseSplits } from "./split-math.ts";
import { summarizeTrip, type TripSnapshot } from "./trip-model.ts";

type CardiffDatabase = ReturnType<typeof makeDatabase<typeof schema>>;
type CardiffDatabaseClient = CardiffDatabase["db"];

const actorLabel = "Someone";
const slugByteLength = 18;
const avatarColors = [
  "#126C5A",
  "#F2B84B",
  "#E76F51",
  "#8ECAE6",
  "#12343B",
  "#52645E",
  "#6B8F71",
  "#C97954",
] as const;

const loadTripInput = z.object({
  slug: z.string().min(8),
});

const createTripInput = z.object({
  name: z.string().trim().min(1).max(80),
  participantNames: z.array(z.string().trim().min(1).max(48)).max(30).default([]),
});

const participantInput = z.object({
  tripSlug: z.string().min(8),
  name: z.string().trim().min(1).max(48),
});

const updateParticipantInput = participantInput.extend({
  participantId: z.string().min(1),
  avatarType: z.enum(["emoji", "initials"]),
  avatarValue: z.string().trim().min(1).max(8),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
});

const expenseInput = z.object({
  tripSlug: z.string().min(8),
  expenseId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(80),
  amountCents: z.number().int().positive(),
  payerParticipantId: z.string().min(1),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  splitMethod: z.enum(["equal", "exact", "percentage"]),
  includedParticipantIds: z.array(z.string().min(1)).min(1),
  exactSplits: z
    .array(
      z.object({
        participantId: z.string().min(1),
        amountCents: z.number().int().min(0),
      }),
    )
    .default([]),
  percentageSplits: z
    .array(
      z.object({
        participantId: z.string().min(1),
        percentageBasisPoints: z.number().int().min(0),
      }),
    )
    .default([]),
});

const deleteExpenseInput = z.object({
  tripSlug: z.string().min(8),
  expenseId: z.string().min(1),
});

const settlementInput = z.object({
  tripSlug: z.string().min(8),
  settlementId: z.string().min(1).optional(),
  fromParticipantId: z.string().min(1),
  toParticipantId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

const deleteSettlementInput = z.object({
  tripSlug: z.string().min(8),
  settlementId: z.string().min(1),
});

export const loadTrip = createServerFn({ method: "GET" })
  .inputValidator(loadTripInput)
  .handler(async ({ data }) => {
    return await readTripSnapshot(data.slug, { allowMissing: true });
  });

export const createTrip = createServerFn({ method: "POST" })
  .inputValidator(createTripInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const now = new Date();
    const tripId = crypto.randomUUID();
    const slug = await createUniqueSlug(database.db);

    await database.db.insert(trips).values({
      id: tripId,
      slug,
      name: data.name,
      currency: "USD",
      createdAt: now,
      updatedAt: now,
    });

    await writeActivity(database.db, {
      tripId,
      eventType: "created",
      entityType: "trip",
      entityId: tripId,
      summary: `Created ${data.name}.`,
      createdAt: now,
    });

    await Promise.all(
      uniqueNames(data.participantNames).map((name) =>
        insertParticipant(database.db, {
          tripId,
          name,
          createdAt: now,
        }),
      ),
    );

    return { slug };
  });

export const addParticipant = createServerFn({ method: "POST" })
  .inputValidator(participantInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const now = new Date();

    await insertParticipant(database.db, {
      tripId: trip.id,
      name: data.name,
      createdAt: now,
    });

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: "created",
      entityType: "participant",
      entityId: trip.id,
      summary: `Added ${data.name}.`,
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

export const updateParticipant = createServerFn({ method: "POST" })
  .inputValidator(updateParticipantInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const existingParticipants = await readParticipants(database.db, trip.id);
    const participant = existingParticipants.find((row) => row.id === data.participantId);

    if (participant === undefined) {
      throw new Error("Participant not found.");
    }

    const now = new Date();

    await database.db
      .update(participants)
      .set({
        name: data.name,
        avatarType: data.avatarType,
        avatarValue: data.avatarValue,
        color: data.color,
        updatedAt: now,
      })
      .where(and(eq(participants.id, data.participantId), eq(participants.tripId, trip.id)));

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: "edited",
      entityType: "participant",
      entityId: data.participantId,
      summary: `Updated ${data.name}.`,
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

export const saveExpense = createServerFn({ method: "POST" })
  .inputValidator(expenseInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const tripParticipants = await readParticipants(database.db, trip.id);
    const participantIds = new Set(tripParticipants.map((participant) => participant.id));

    assertTripParticipant(participantIds, data.payerParticipantId);
    for (const participantId of data.includedParticipantIds) {
      assertTripParticipant(participantIds, participantId);
    }

    const splitRows = buildSplitRows(data);
    const now = new Date();
    const expenseDate = new Date(`${data.expenseDate}T12:00:00.000Z`);
    const expenseId = data.expenseId ?? crypto.randomUUID();

    if (data.expenseId === undefined) {
      await database.db.insert(expenses).values({
        id: expenseId,
        tripId: trip.id,
        title: data.title,
        amountCents: data.amountCents,
        payerParticipantId: data.payerParticipantId,
        expenseDate,
        splitMethod: data.splitMethod,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existingExpense = await findExpense(database.db, trip.id, data.expenseId);

      if (existingExpense === undefined) {
        throw new Error("Expense not found.");
      }

      await database.db
        .update(expenses)
        .set({
          title: data.title,
          amountCents: data.amountCents,
          payerParticipantId: data.payerParticipantId,
          expenseDate,
          splitMethod: data.splitMethod,
          updatedAt: now,
        })
        .where(and(eq(expenses.id, data.expenseId), eq(expenses.tripId, trip.id)));

      await database.db.delete(expenseSplits).where(eq(expenseSplits.expenseId, data.expenseId));
    }

    await database.db.insert(expenseSplits).values(
      splitRows.map((split) => ({
        id: crypto.randomUUID(),
        expenseId,
        participantId: split.participantId,
        amountCents: split.amountCents,
        percentageBasisPoints: split.percentageBasisPoints,
      })),
    );

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: data.expenseId === undefined ? "created" : "edited",
      entityType: "expense",
      entityId: expenseId,
      summary: `${data.expenseId === undefined ? "Added" : "Updated"} ${data.title}.`,
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .inputValidator(deleteExpenseInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const existingExpense = await findExpense(database.db, trip.id, data.expenseId);

    if (existingExpense === undefined) {
      throw new Error("Expense not found.");
    }

    const now = new Date();

    await database.db.delete(expenseSplits).where(eq(expenseSplits.expenseId, data.expenseId));
    await database.db
      .delete(expenses)
      .where(and(eq(expenses.id, data.expenseId), eq(expenses.tripId, trip.id)));

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: "deleted",
      entityType: "expense",
      entityId: data.expenseId,
      summary: `Deleted ${existingExpense.title}.`,
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

export const saveSettlement = createServerFn({ method: "POST" })
  .inputValidator(settlementInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const tripParticipants = await readParticipants(database.db, trip.id);
    const participantIds = new Set(tripParticipants.map((participant) => participant.id));
    const fromParticipant = tripParticipants.find(
      (participant) => participant.id === data.fromParticipantId,
    );
    const toParticipant = tripParticipants.find(
      (participant) => participant.id === data.toParticipantId,
    );

    assertTripParticipant(participantIds, data.fromParticipantId);
    assertTripParticipant(participantIds, data.toParticipantId);

    if (data.fromParticipantId === data.toParticipantId) {
      throw new Error("Choose two different people.");
    }

    const now = new Date();
    const settlementId = data.settlementId ?? crypto.randomUUID();

    if (data.settlementId === undefined) {
      await database.db.insert(settlements).values({
        id: settlementId,
        tripId: trip.id,
        fromParticipantId: data.fromParticipantId,
        toParticipantId: data.toParticipantId,
        amountCents: data.amountCents,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existingSettlement = await findSettlement(database.db, trip.id, data.settlementId);

      if (existingSettlement === undefined) {
        throw new Error("Settlement not found.");
      }

      await database.db
        .update(settlements)
        .set({
          fromParticipantId: data.fromParticipantId,
          toParticipantId: data.toParticipantId,
          amountCents: data.amountCents,
          updatedAt: now,
        })
        .where(and(eq(settlements.id, data.settlementId), eq(settlements.tripId, trip.id)));
    }

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: data.settlementId === undefined ? "settled" : "edited",
      entityType: "settlement",
      entityId: settlementId,
      summary: `${fromParticipant?.name ?? "Someone"} paid ${
        toParticipant?.name ?? "someone"
      } ${formatCurrency(data.amountCents)}.`,
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

export const deleteSettlement = createServerFn({ method: "POST" })
  .inputValidator(deleteSettlementInput)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const trip = await findTripBySlug(database.db, data.tripSlug);
    const existingSettlement = await findSettlement(database.db, trip.id, data.settlementId);

    if (existingSettlement === undefined) {
      throw new Error("Settlement not found.");
    }

    const now = new Date();

    await database.db
      .delete(settlements)
      .where(and(eq(settlements.id, data.settlementId), eq(settlements.tripId, trip.id)));

    await writeActivity(database.db, {
      tripId: trip.id,
      eventType: "deleted",
      entityType: "settlement",
      entityId: data.settlementId,
      summary: "Deleted a payment record.",
      createdAt: now,
    });

    return await readTripSnapshot(data.tripSlug);
  });

async function getDatabase() {
  const cloudflareWorkersModule = "cloudflare:workers";
  const { env } = await import(cloudflareWorkersModule);
  const bindings = env as { readonly [templarBindings.db]: D1Database };

  return makeDatabase(bindings[templarBindings.db], { schema });
}

async function readTripSnapshot(slug: string): Promise<TripSnapshot>;
async function readTripSnapshot(
  slug: string,
  options: { readonly allowMissing: true },
): Promise<TripSnapshot | null>;
async function readTripSnapshot(
  slug: string,
  options?: { readonly allowMissing: true },
): Promise<TripSnapshot | null> {
  const database = await getDatabase();
  const trip =
    options?.allowMissing === true
      ? await findTripBySlugOrNull(database.db, slug)
      : await findTripBySlug(database.db, slug);

  if (trip === null) {
    return null;
  }

  const [participantRows, expenseRows, splitRows, settlementRows, activityRows] = await Promise.all(
    [
      readParticipants(database.db, trip.id),
      database.db
        .select()
        .from(expenses)
        .where(eq(expenses.tripId, trip.id))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
      database.db
        .select({
          id: expenseSplits.id,
          expenseId: expenseSplits.expenseId,
          participantId: expenseSplits.participantId,
          amountCents: expenseSplits.amountCents,
          percentageBasisPoints: expenseSplits.percentageBasisPoints,
        })
        .from(expenseSplits)
        .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
        .where(eq(expenses.tripId, trip.id)),
      database.db
        .select()
        .from(settlements)
        .where(eq(settlements.tripId, trip.id))
        .orderBy(desc(settlements.createdAt)),
      database.db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.tripId, trip.id))
        .orderBy(desc(activityEvents.createdAt))
        .limit(80),
    ],
  );

  return summarizeTrip({
    trip: {
      id: trip.id,
      slug: trip.slug,
      name: trip.name,
      currency: trip.currency,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    },
    participants: participantRows.map((participant) => ({
      id: participant.id,
      name: participant.name,
      avatarType: participant.avatarType,
      avatarValue: participant.avatarValue,
      color: participant.color,
      createdAt: participant.createdAt.toISOString(),
      updatedAt: participant.updatedAt.toISOString(),
    })),
    expenses: expenseRows.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amountCents: expense.amountCents,
      payerParticipantId: expense.payerParticipantId,
      expenseDate: expense.expenseDate.toISOString(),
      splitMethod: expense.splitMethod,
      splits: splitRows
        .filter((split) => split.expenseId === expense.id)
        .map((split) => ({
          id: split.id,
          participantId: split.participantId,
          amountCents: split.amountCents,
          percentageBasisPoints: split.percentageBasisPoints,
        })),
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
    })),
    settlements: settlementRows.map((settlement) => ({
      id: settlement.id,
      fromParticipantId: settlement.fromParticipantId,
      toParticipantId: settlement.toParticipantId,
      amountCents: settlement.amountCents,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    })),
    activityEvents: activityRows.map((event) => ({
      id: event.id,
      actorLabel: event.actorLabel,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      summary: event.summary,
      metadataJson: event.metadataJson,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}

async function readParticipants(database: CardiffDatabaseClient, tripId: string) {
  return await database
    .select()
    .from(participants)
    .where(eq(participants.tripId, tripId))
    .orderBy(participants.createdAt);
}

async function findTripBySlug(database: CardiffDatabaseClient, slug: string) {
  const trip = await findTripBySlugOrNull(database, slug);

  if (trip === null) {
    throw new Error("Trip not found.");
  }

  return trip;
}

async function findTripBySlugOrNull(database: CardiffDatabaseClient, slug: string) {
  const [trip] = await database.select().from(trips).where(eq(trips.slug, slug)).limit(1);

  return trip ?? null;
}

async function findExpense(database: CardiffDatabaseClient, tripId: string, expenseId: string) {
  const [expense] = await database
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)))
    .limit(1);

  return expense;
}

async function findSettlement(
  database: CardiffDatabaseClient,
  tripId: string,
  settlementId: string,
) {
  const [settlement] = await database
    .select()
    .from(settlements)
    .where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
    .limit(1);

  return settlement;
}

async function insertParticipant(
  database: CardiffDatabaseClient,
  input: { readonly tripId: string; readonly name: string; readonly createdAt: Date },
) {
  const id = crypto.randomUUID();
  const color = avatarColors[randomInteger(avatarColors.length)] ?? avatarColors[0];

  await database.insert(participants).values({
    id,
    tripId: input.tripId,
    name: input.name,
    avatarType: "initials",
    avatarValue: initialsForName(input.name),
    color,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });

  return id;
}

async function writeActivity(
  database: CardiffDatabaseClient,
  input: {
    readonly tripId: string;
    readonly eventType: "created" | "edited" | "deleted" | "settled";
    readonly entityType: "trip" | "participant" | "expense" | "settlement";
    readonly entityId: string;
    readonly summary: string;
    readonly createdAt: Date;
    readonly metadata?: Record<string, unknown>;
  },
) {
  await database.insert(activityEvents).values({
    id: crypto.randomUUID(),
    tripId: input.tripId,
    actorLabel,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    createdAt: input.createdAt,
  });
}

async function createUniqueSlug(database: CardiffDatabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = randomToken(slugByteLength);
    // eslint-disable-next-line no-await-in-loop -- each candidate depends on a uniqueness check.
    const [existingTrip] = await database.select().from(trips).where(eq(trips.slug, slug)).limit(1);

    if (existingTrip === undefined) {
      return slug;
    }
  }

  throw new Error("Could not create a private trip link.");
}

function buildSplitRows(data: z.infer<typeof expenseInput>) {
  switch (data.splitMethod) {
    case "equal":
      return calculateExpenseSplits({
        amountCents: data.amountCents,
        method: "equal",
        participantIds: data.includedParticipantIds,
      });
    case "exact":
      return calculateExpenseSplits({
        amountCents: data.amountCents,
        method: "exact",
        splits: data.includedParticipantIds.map((participantId) => {
          const split = data.exactSplits.find((item) => item.participantId === participantId);

          if (split === undefined) {
            throw new Error("Exact split amounts must be provided for everyone included.");
          }

          return split;
        }),
      });
    case "percentage":
      return calculateExpenseSplits({
        amountCents: data.amountCents,
        method: "percentage",
        splits: data.includedParticipantIds.map((participantId) => {
          const split = data.percentageSplits.find((item) => item.participantId === participantId);

          if (split === undefined) {
            throw new Error("Percentages must be provided for everyone included.");
          }

          return split;
        }),
      });
  }
}

function assertTripParticipant(participantIds: ReadonlySet<string>, participantId: string) {
  if (!participantIds.has(participantId)) {
    throw new Error("Choose a person in this trip.");
  }
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomInteger(maxExclusive: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);

  return (bytes[0] ?? 0) % maxExclusive;
}

function initialsForName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function uniqueNames(names: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const normalized = name.trim();
    const key = normalized.toLocaleLowerCase("en-US");

    if (normalized.length > 0 && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}
