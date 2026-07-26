import { createServerFn } from "@tanstack/react-start";
import { desc, makeDatabase } from "@templar/db";
import * as schema from "../../../../db/schema.ts";
import { guests, households } from "../../../../db/schema.ts";
import type { AdminAccess } from "./admin-auth.ts";
import { getAdminAccess, requireAdmin } from "./auth.server.ts";
import {
  buildEnrollmentDashboard,
  type EnrollmentDashboard,
  householdEnrollmentInput,
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
        name: context.data.householdName,
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
