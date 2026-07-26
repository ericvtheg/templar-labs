import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "@templar/db";
import {
  eventInvitations,
  guestEventResponses,
  guests,
  householdRsvps,
  households,
  plusOneResponses,
} from "../../../../db/schema.ts";
import type { AdminAccess } from "./admin-auth.ts";
import { getAdminAccess, requireAdmin } from "./auth.server.ts";
import { getWeddingDatabase, type WeddingDatabase } from "./database.server.ts";
import {
  buildEnrollmentDashboard,
  type EnrollmentDashboard,
  householdDeleteInput,
  householdEnrollmentInput,
  householdUpdateInput,
} from "./enrollment.ts";
import { normalizeGuestName } from "./guest-name.ts";

export type AdminDashboardLoaderData =
  | {
      readonly access: "authorized";
      readonly dashboard: EnrollmentDashboard;
    }
  | {
      readonly access: Exclude<AdminAccess, "authorized">;
      readonly dashboard: null;
    };

export const loadAdminDashboard = createServerFn({ method: "GET" }).handler(
  async (context): Promise<AdminDashboardLoaderData> => {
    const request = requestFromContext(context);
    const access = await getAdminAccess(request);

    if (access !== "authorized") {
      return { access, dashboard: null };
    }

    await requireAdmin(request);

    return {
      access: "authorized",
      dashboard: await readEnrollmentDashboard(await getWeddingDatabase()),
    };
  },
);

export const enrollHousehold = createServerFn({ method: "POST" })
  .inputValidator(householdEnrollmentInput)
  .handler(async (context) => {
    const request = requestFromContext(context);
    await requireAdmin(request);

    const database = await getWeddingDatabase();
    await ensureUniqueGuestNames(database, context.data.guests);
    const householdId = crypto.randomUUID();
    const now = new Date();

    const enrolledGuests = context.data.guests.map((guest, position) => ({
      id: crypto.randomUUID(),
      householdId,
      name: guest.name,
      plusOneAllowed: guest.plusOneAllowed,
      position,
      createdAt: now,
      updatedAt: now,
      eventIds: guest.eventIds,
    }));

    await database.db.batch([
      database.db.insert(households).values({
        id: householdId,
        ...householdValues(context.data),
        createdAt: now,
        updatedAt: now,
      }),
      database.db.insert(guests).values(enrolledGuests.map(({ eventIds: _, ...guest }) => guest)),
      database.db
        .insert(eventInvitations)
        .values(
          enrolledGuests.flatMap((guest) =>
            guest.eventIds.map((eventId) => ({ guestId: guest.id, eventId, createdAt: now })),
          ),
        ),
    ]);

    return await readEnrollmentDashboard(database);
  });

export const updateHousehold = createServerFn({ method: "POST" })
  .inputValidator(householdUpdateInput)
  .handler(async (context) => {
    const request = requestFromContext(context);
    await requireAdmin(request);

    const database = await getWeddingDatabase();
    const existingHouseholds = await database.db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, context.data.householdId))
      .limit(1);

    if (existingHouseholds[0] === undefined) {
      throw new Error("Household not found.");
    }

    const existingGuests = await database.db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.householdId, context.data.householdId));
    const existingGuestIds = new Set(existingGuests.map((guest) => guest.id));
    const submittedGuestIds = new Set<string>();

    for (const guest of context.data.guests) {
      if (guest.id === undefined) {
        continue;
      }

      if (!existingGuestIds.has(guest.id) || submittedGuestIds.has(guest.id)) {
        throw new Error("Invalid household guest.");
      }

      submittedGuestIds.add(guest.id);
    }

    await ensureUniqueGuestNames(database, context.data.guests, existingGuestIds);

    const now = new Date();

    await database.db
      .update(households)
      .set({
        ...householdValues(context.data),
        updatedAt: now,
      })
      .where(eq(households.id, context.data.householdId));

    const resolvedGuests = context.data.guests.map((guest, position) => ({
      ...guest,
      id: guest.id ?? crypto.randomUUID(),
      position,
    }));

    await Promise.all(
      resolvedGuests.map((guest) => {
        if (guest.id === undefined) {
          throw new Error("Guest identifier unavailable.");
        }

        return existingGuestIds.has(guest.id)
          ? database.db
              .update(guests)
              .set({
                name: guest.name,
                plusOneAllowed: guest.plusOneAllowed,
                position: guest.position,
                updatedAt: now,
              })
              .where(eq(guests.id, guest.id))
          : database.db.insert(guests).values({
              id: guest.id,
              householdId: context.data.householdId,
              name: guest.name,
              plusOneAllowed: guest.plusOneAllowed,
              position: guest.position,
              createdAt: now,
              updatedAt: now,
            });
      }),
    );

    await Promise.all(
      existingGuests.map((guest) =>
        database.db.delete(eventInvitations).where(eq(eventInvitations.guestId, guest.id)),
      ),
    );

    await database.db
      .insert(eventInvitations)
      .values(
        resolvedGuests.flatMap((guest) =>
          guest.eventIds.map((eventId) => ({ guestId: guest.id, eventId, createdAt: now })),
        ),
      );

    const removedGuestIds = existingGuests
      .map((guest) => guest.id)
      .filter((guestId) => !submittedGuestIds.has(guestId));

    await Promise.all(
      removedGuestIds.map((guestId) => database.db.delete(guests).where(eq(guests.id, guestId))),
    );

    return await readEnrollmentDashboard(database);
  });

export const deleteHousehold = createServerFn({ method: "POST" })
  .inputValidator(householdDeleteInput)
  .handler(async (context) => {
    const request = requestFromContext(context);
    await requireAdmin(request);

    const database = await getWeddingDatabase();
    await database.db.delete(households).where(eq(households.id, context.data.householdId));

    return await readEnrollmentDashboard(database);
  });

function householdValues(data: {
  readonly householdName: string;
  readonly contactEmail: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
}) {
  return {
    name: data.householdName,
    contactEmail: emptyToNull(data.contactEmail),
    addressLine1: emptyToNull(data.addressLine1),
    addressLine2: emptyToNull(data.addressLine2),
    city: emptyToNull(data.city),
    region: emptyToNull(data.region),
    postalCode: emptyToNull(data.postalCode),
    country: emptyToNull(data.country),
  };
}

function emptyToNull(value: string) {
  return value.length === 0 ? null : value;
}

function requestFromContext(context: unknown): Request {
  const request = (context as { readonly request?: Request }).request;

  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  return request;
}

async function readEnrollmentDashboard(database: WeddingDatabase): Promise<EnrollmentDashboard> {
  const [
    householdRows,
    guestRows,
    eventInvitationRows,
    householdRsvpRows,
    eventResponseRows,
    plusOneResponseRows,
  ] = await Promise.all([
    database.db.select().from(households).orderBy(desc(households.createdAt)),
    database.db.select().from(guests),
    database.db.select().from(eventInvitations),
    database.db.select().from(householdRsvps),
    database.db.select().from(guestEventResponses),
    database.db.select().from(plusOneResponses),
  ]);

  return buildEnrollmentDashboard(
    householdRows,
    guestRows,
    eventInvitationRows,
    householdRsvpRows,
    eventResponseRows,
    plusOneResponseRows,
  );
}

async function ensureUniqueGuestNames(
  database: WeddingDatabase,
  submittedGuests: readonly { readonly name: string }[],
  ignoredGuestIds: ReadonlySet<string> = new Set(),
) {
  const submittedNames = submittedGuests.map((guest) => normalizeGuestName(guest.name));

  if (new Set(submittedNames).size !== submittedNames.length) {
    throw new Error("Each named guest needs a unique full name.");
  }

  const existingGuests = await database.db
    .select({ id: guests.id, name: guests.name })
    .from(guests);
  const existingNames = new Set(
    existingGuests
      .filter((guest) => !ignoredGuestIds.has(guest.id))
      .map((guest) => normalizeGuestName(guest.name)),
  );

  if (submittedNames.some((name) => existingNames.has(name))) {
    throw new Error("That full name is already assigned to another invitation.");
  }
}
