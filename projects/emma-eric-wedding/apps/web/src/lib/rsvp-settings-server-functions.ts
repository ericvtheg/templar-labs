import { createServerFn } from "@tanstack/react-start";
import { eq } from "@templar/db";
import { rsvpSettings as rsvpSettingsTable } from "../../../../db/schema.ts";
import { requireAdmin } from "./auth.server.ts";
import { getWeddingDatabase, type WeddingDatabase } from "./database.server.ts";
import {
  defaultRsvpDeadline,
  type RsvpSettings,
  resolveRsvpSettings,
  rsvpSettingsId,
  rsvpSettingsInput,
} from "./rsvp-settings.ts";

export const loadRsvpSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<RsvpSettings> => readRsvpSettings(await getWeddingDatabase()),
);

export const updateRsvpSettings = createServerFn({ method: "POST" })
  .inputValidator(rsvpSettingsInput)
  .handler(async (context): Promise<RsvpSettings> => {
    await requireAdmin(requestFromContext(context));

    const database = await getWeddingDatabase();
    await database.db
      .insert(rsvpSettingsTable)
      .values({
        id: rsvpSettingsId,
        deadline: context.data.deadline,
        isOpen: context.data.isOpen,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: rsvpSettingsTable.id,
        set: {
          deadline: context.data.deadline,
          isOpen: context.data.isOpen,
          updatedAt: new Date(),
        },
      });

    return readRsvpSettings(database);
  });

export async function readRsvpSettings(
  database: WeddingDatabase,
  now: Date = new Date(),
): Promise<RsvpSettings> {
  const rows = await database.db
    .select({ deadline: rsvpSettingsTable.deadline, isOpen: rsvpSettingsTable.isOpen })
    .from(rsvpSettingsTable)
    .where(eq(rsvpSettingsTable.id, rsvpSettingsId))
    .limit(1);

  return resolveRsvpSettings(rows[0] ?? { deadline: defaultRsvpDeadline, isOpen: true }, now);
}

function requestFromContext(context: unknown): Request {
  const request = (context as { readonly request?: Request }).request;

  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  return request;
}
