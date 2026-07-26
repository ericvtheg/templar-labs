import { eventById, mealOptionById } from "../content/rsvp.ts";
import type { LateRsvpCancellation, RsvpHousehold } from "./rsvp.ts";

export type RsvpEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

export function buildRsvpConfirmationEmail(household: RsvpHousehold): RsvpEmail {
  const guestText = household.guests.flatMap((guest) => {
    const lines = guest.eventResponses.map((response) => {
      const weddingEvent = eventById(response.eventId);
      const meal =
        response.mealOptionId === null
          ? null
          : mealOptionById(response.eventId, response.mealOptionId);

      return `  ${weddingEvent?.shortTitle ?? response.eventId}: ${response.attending ? "Attending" : "Declining"}${meal === undefined || meal === null ? "" : ` · ${meal.label}`}`;
    });

    if (guest.dietaryRestrictions.length > 0) {
      lines.push(`  Dietary restrictions: ${guest.dietaryRestrictions}`);
    }

    if (guest.plusOne !== null) {
      lines.push(`  Guest: ${guest.plusOne.name}`);
      if (guest.plusOne.dietaryRestrictions.length > 0) {
        lines.push(`    Dietary restrictions: ${guest.plusOne.dietaryRestrictions}`);
      }
      for (const response of guest.eventResponses.filter((candidate) => candidate.attending)) {
        const weddingEvent = eventById(response.eventId);
        const selection = guest.plusOne.mealSelections.find(
          (meal) => meal.eventId === response.eventId,
        );
        const meal =
          selection === undefined
            ? undefined
            : mealOptionById(response.eventId, selection.mealOptionId);
        lines.push(
          `    ${weddingEvent?.shortTitle ?? response.eventId}: Attending${meal === undefined ? "" : ` · ${meal.label}`}`,
        );
      }
    }

    return [guest.name, ...lines, ""];
  });
  const text = [
    "Your RSVP is confirmed",
    "",
    `Emma & Eric · September 25, 2027`,
    "",
    ...guestText,
    ...(household.message.length === 0 ? [] : ["Your note to Emma & Eric", household.message, ""]),
    "You can return to the wedding website and enter a full name from your invitation to update this response before the deadline. After the deadline, you can still report cancellations.",
  ].join("\n");

  const guestHtml = household.guests
    .map((guest) => {
      const responses = guest.eventResponses
        .map((response) => {
          const weddingEvent = eventById(response.eventId);
          const meal =
            response.mealOptionId === null
              ? null
              : mealOptionById(response.eventId, response.mealOptionId);

          return `<li><strong>${escapeHtml(weddingEvent?.shortTitle ?? response.eventId)}:</strong> ${
            response.attending ? "Attending" : "Declining"
          }${meal === undefined || meal === null ? "" : ` · ${escapeHtml(meal.label)}`}</li>`;
        })
        .join("");
      const dietaryRestrictions =
        guest.dietaryRestrictions.length === 0
          ? ""
          : `<p><strong>Dietary restrictions:</strong> ${escapeHtml(guest.dietaryRestrictions)}</p>`;
      const plusOne =
        guest.plusOne === null
          ? ""
          : `<p><strong>Guest:</strong> ${escapeHtml(guest.plusOne.name)}</p>${
              guest.plusOne.dietaryRestrictions.length === 0
                ? ""
                : `<p><strong>Dietary restrictions:</strong> ${escapeHtml(guest.plusOne.dietaryRestrictions)}</p>`
            }${
              guest.eventResponses.every((response) => !response.attending)
                ? ""
                : `<ul>${guest.eventResponses
                    .filter((response) => response.attending)
                    .map((response) => {
                      const weddingEvent = eventById(response.eventId);
                      const selection = guest.plusOne?.mealSelections.find(
                        (meal) => meal.eventId === response.eventId,
                      );
                      const meal =
                        selection === undefined
                          ? undefined
                          : mealOptionById(response.eventId, selection.mealOptionId);
                      return `<li><strong>${escapeHtml(weddingEvent?.shortTitle ?? response.eventId)}:</strong> Attending${meal === undefined ? "" : ` · ${escapeHtml(meal.label)}`}</li>`;
                    })
                    .join("")}</ul>`
            }`;

      return `<section style="margin:24px 0"><h2 style="font:600 24px Georgia,serif;margin:0 0 10px">${escapeHtml(guest.name)}</h2><ul style="line-height:1.7;margin:0;padding-left:20px">${responses}</ul>${dietaryRestrictions}${plusOne}</section>`;
    })
    .join("");
  const householdMessageHtml =
    household.message.length === 0
      ? ""
      : `<section style="background:#fbf6ee;border-radius:16px;margin:24px 0;padding:20px"><p style="color:#6f7353;font-size:12px;font-weight:700;letter-spacing:.08em;margin:0 0 8px;text-transform:uppercase">Your note to Emma &amp; Eric</p><p style="line-height:1.7;margin:0;white-space:pre-wrap">${escapeHtml(household.message)}</p></section>`;

  return {
    subject: "Your RSVP for Emma & Eric",
    text,
    html: `<div style="background:#fbf6ee;color:#44472f;font:16px Arial,sans-serif;padding:32px"><div style="background:#fffdf8;border:1px solid #e8dfd3;border-radius:24px;margin:auto;max-width:620px;padding:32px"><p style="color:#ef5351;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">September 25, 2027</p><h1 style="font:500 42px Georgia,serif;margin:0">Your RSVP is confirmed.</h1><p style="line-height:1.7">Here is the complete response for ${escapeHtml(household.name)}.</p>${guestHtml}${householdMessageHtml}<p style="border-top:1px solid #e8dfd3;line-height:1.7;margin-top:28px;padding-top:22px">You can return to the wedding website and enter a full name from your invitation to update this response before the deadline. After the deadline, you can still report cancellations.</p></div></div>`,
  };
}

export function buildLateCancellationEmail(
  household: RsvpHousehold,
  cancellations: readonly LateRsvpCancellation[],
): RsvpEmail {
  const cancellationText = cancellations.map(
    (cancellation) => `- ${cancellation.name}: ${cancellation.event}`,
  );
  const cancellationHtml = cancellations
    .map(
      (cancellation) =>
        `<li><strong>${escapeHtml(cancellation.name)}:</strong> ${escapeHtml(cancellation.event)}</li>`,
    )
    .join("");

  return {
    subject: `Late RSVP cancellation · ${household.name}`,
    text: [
      "Late RSVP cancellation",
      "",
      household.name,
      ...cancellationText,
      "",
      `Guest contact: ${household.contactEmail}`,
    ].join("\n"),
    html: `<div style="background:#fbf6ee;color:#44472f;font:16px Arial,sans-serif;padding:32px"><div style="background:#fffdf8;border:1px solid #e8dfd3;border-radius:24px;margin:auto;max-width:620px;padding:32px"><p style="color:#ef5351;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Late RSVP cancellation</p><h1 style="font:500 38px Georgia,serif;margin:0 0 18px">${escapeHtml(household.name)}</h1><ul style="line-height:1.8;padding-left:20px">${cancellationHtml}</ul><p style="border-top:1px solid #e8dfd3;margin-top:24px;padding-top:18px"><strong>Guest contact:</strong> ${escapeHtml(household.contactEmail)}</p></div></div>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
