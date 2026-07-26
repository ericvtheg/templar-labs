import { createServerFn } from "@tanstack/react-start";
import { desc, eq, makeDatabase } from "@templar/db";
import * as schema from "../../../../db/schema.ts";
import { guests, households } from "../../../../db/schema.ts";
import type { AdminAccess } from "./admin-auth.ts";
import { getAdminAccess, requireAdmin } from "./auth.server.ts";
import {
  buildEnrollmentDashboard,
  type EnrollmentDashboard,
  householdDeleteInput,
  householdEnrollmentInput,
  householdUpdateInput,
} from "./enrollment.ts";

type EnrollmentDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

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
      dashboard: await readEnrollmentDashboard(await getDatabase()),
    };
  },
);

export const enrollHousehold = createServerFn({ method: "POST" })
  .inputValidator(householdEnrollmentInput)
  .handler(async (context) => {
    const request = requestFromContext(context);
    await requireAdmin(request);

    const database = await getDatabase();
    const householdId = crypto.randomUUID();
    const now = new Date();

    await database.db.batch([
      database.db.insert(households).values({
        id: householdId,
        ...householdValues(context.data),
        createdAt: now,
        updatedAt: now,
      }),
      database.db.insert(guests).values(
        context.data.guests.map((guest, position) => ({
          id: crypto.randomUUID(),
          householdId,
          name: guest.name,
          plusOneAllowed: guest.plusOneAllowed,
          position,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    ]);

    return await readEnrollmentDashboard(database);
  });

export const updateHousehold = createServerFn({ method: "POST" })
  .inputValidator(householdUpdateInput)
  .handler(async (context) => {
    const request = requestFromContext(context);
    await requireAdmin(request);

    const database = await getDatabase();
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

    const now = new Date();

    await database.db
      .update(households)
      .set({
        ...householdValues(context.data),
        updatedAt: now,
      })
      .where(eq(households.id, context.data.householdId));

    await Promise.all(
      context.data.guests.map((guest, position) => {
        if (guest.id === undefined) {
          return database.db.insert(guests).values({
            id: crypto.randomUUID(),
            householdId: context.data.householdId,
            name: guest.name,
            plusOneAllowed: guest.plusOneAllowed,
            position,
            createdAt: now,
            updatedAt: now,
          });
        }

        return database.db
          .update(guests)
          .set({
            name: guest.name,
            plusOneAllowed: guest.plusOneAllowed,
            position,
            updatedAt: now,
          })
          .where(eq(guests.id, guest.id));
      }),
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

    const database = await getDatabase();
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

async function getDatabase(): Promise<EnrollmentDatabase> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly DB: D1Database };

  return makeDatabase(bindings.DB, { schema });
}

async function readEnrollmentDashboard(database: EnrollmentDatabase): Promise<EnrollmentDashboard> {
  const [householdRows, guestRows] = await Promise.all([
    database.db.select().from(households).orderBy(desc(households.createdAt)),
    database.db.select().from(guests),
  ]);

  return buildEnrollmentDashboard(householdRows, guestRows);
}
