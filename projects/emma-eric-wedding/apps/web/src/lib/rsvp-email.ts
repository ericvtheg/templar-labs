import { eventById, mealOptionById } from "../content/rsvp.ts";
import type { RsvpHousehold } from "./rsvp.ts";

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

    if (guest.plusOne !== null) {
      lines.push(`  Guest: ${guest.plusOne.name}`);
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
    "You can return to the wedding website and enter a full name from your invitation to update this response.",
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
      const plusOne =
        guest.plusOne === null
          ? ""
          : `<p><strong>Guest:</strong> ${escapeHtml(guest.plusOne.name)}</p>${
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

      return `<section style="margin:24px 0"><h2 style="font:600 24px Georgia,serif;margin:0 0 10px">${escapeHtml(guest.name)}</h2><ul style="line-height:1.7;margin:0;padding-left:20px">${responses}</ul>${plusOne}</section>`;
    })
    .join("");

  return {
    subject: "Your RSVP for Emma & Eric",
    text,
    html: `<div style="background:#fbf6ee;color:#44472f;font:16px Arial,sans-serif;padding:32px"><div style="background:#fffdf8;border:1px solid #e8dfd3;border-radius:24px;margin:auto;max-width:620px;padding:32px"><p style="color:#ef5351;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">September 25, 2027</p><h1 style="font:500 42px Georgia,serif;margin:0">Your RSVP is confirmed.</h1><p style="line-height:1.7">Here is the complete response for ${escapeHtml(household.name)}.</p>${guestHtml}<p style="border-top:1px solid #e8dfd3;line-height:1.7;margin-top:28px;padding-top:22px">You can return to the wedding website and enter a full name from your invitation to update this response.</p></div></div>`,
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
