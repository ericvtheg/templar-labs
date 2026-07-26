# Wedding Website and RSVP Feature Backlog

This document collects potential features for the Emma and Eric wedding
website and its future RSVP system. It is a backlog, not a commitment to build
every item.

## Implemented RSVP Foundation

- One shared RSVP URL suitable for a shared invitation QR code.
- Exact full-name lookup, with no postal-code confirmation while names remain unique.
- One household flow showing every invited event before responses begin.
- Per-person attendance for the wedding and rehearsal dinner.
- One review and one final confirmation for the complete household response.
- Per-person wedding meal choices and optional dietary restrictions using temporary mock menu options.
- Named plus-ones with their own meal choices; they attend the same selected events as their host.
- Existing responses can be reviewed and updated through the same lookup flow.
- A required confirmation email address and one best-effort send after each successful save.
- Admin event assignment, RSVP status, event headcounts, responses, meals, and plus-one names.
- Server validation, signed household access, rate-limited name lookup, and response history.

## Suggested First Release

- Guest lookup by first and last name.
- Household and party recognition.
- Attendance responses for each named guest.
- Attendance responses for each event a guest is invited to.
- Controlled plus-one support.
- Meal selections, dietary restrictions, and allergies.
- Optional message to Emma and Eric.
- Review and confirmation before submission.
- Ability to update an RSVP before the deadline.
- RSVP confirmation email.
- Protected administration with response totals and CSV export.

## RSVP Flow

- RSVP page linked from the wedding website.
- Guest lookup by first and last name.
- Household and party recognition.
- Show only the people included on an invitation.
- Accept or decline for each guest.
- Collect responses for separate events, such as:
  - Welcome event.
  - Ceremony.
  - Reception.
  - Brunch.
- Only show events to which the household is invited.
- Controlled plus-one support.
- Capture a plus-one's name.
- Distinguish adults and children where needed.
- Meal selections.
- Dietary restrictions and allergies.
- Accessibility requirements.
- Transportation or shuttle requirements.
- Optional message to Emma and Eric.
- Optional song request.
- Review answers before submission.
- Confirmation page after submission.
- Allow changes before the RSVP deadline.
- Display the RSVP deadline clearly.
- Close submissions after the deadline while preserving an admin override.
- Provide a clear contact option when a guest cannot complete the form.

## Guest Access

- Exact-name guest lookup.
- Support known alternate names and spelling variants.
- Resolve duplicate names with a postal code or short invitation code.
- Household-level access so one person can respond for the invitation.
- Short private invitation codes as a fallback access method.
- Prevent guests from discovering the full guest list.
- Allow Emma and Eric to enter responses for guests who cannot use the site.
- Maybe: print one shared QR code that links to the RSVP page on every
  invitation.
- Maybe: create unique household links or QR codes.

## Confirmation and Communication

- RSVP confirmation email.
- Updated-RSVP confirmation email.
- Notification to Emma and Eric when a response is submitted.
- Reminder emails before the deadline.
- Follow-up emails to households that have not responded.
- Event update announcements.
- Reply-to address for guest questions.
- Email delivery failure tracking.
- Retry handling for temporary email delivery failures.
- Maybe: SMS reminders.

## Administration

- Password-protected administration.
- Create and edit households.
- Add and edit named guests.
- Store guest contact and mailing information.
- Specify which events each guest is invited to.
- Configure plus-one permissions.
- Record adult and child classifications where needed.
- Enter or update responses on behalf of guests.
- Search and filter guests and households.
- View attending, declined, pending, and total counts.
- View event-by-event headcounts.
- View meal totals.
- View dietary restriction and allergy reports.
- View plus-one details.
- View accessibility and transportation requirements.
- View households that have not responded.
- View recent response activity.
- Record creation and last-updated timestamps.
- Preserve response history or an audit trail.
- Import a guest list from CSV.
- Export guest and response data to CSV.
- Produce vendor-friendly exports for the caterer and venue.
- Download a backup of the guest and RSVP data.
- Configure the RSVP deadline.
- Open and close the RSVP flow.

## General Wedding Website

- Date and venue.
- Weekend schedule.
- Ceremony and reception details.
- Map and directions.
- Parking instructions.
- Transportation and shuttle information.
- Hotel blocks.
- Travel recommendations.
- Dress code.
- Frequently asked questions.
- Registry links.
- Contact information.
- Emma and Eric's story.
- Wedding party introductions.
- Local recommendations.
- Engagement photos.
- Add-to-calendar links.
- Wedding countdown.
- Announcements and last-minute updates.

## Privacy, Security, and Reliability

- Keep the draft site out of search-engine results.
- Validate RSVP access and submissions on the server.
- Validate responses against the canonical guest list.
- Rate-limit guest lookup and RSVP submissions.
- Protect administration routes and data.
- Never expose information about unrelated households.
- Use opaque internal identifiers and unguessable invitation tokens.
- Avoid including guest information directly in QR codes or URLs.
- Prevent accidental duplicate submissions.
- Record submission and update history.
- Back up the RSVP database.
- Handle invalid or expired invitation access clearly.
- Handle database and email failures without losing submitted responses.
- Make the RSVP flow mobile-first.
- Support keyboard navigation and screen readers.
- Use clear labels, validation messages, and focus management.

## Possible Later Features

- Multilingual content.
- Personalized household welcome messages.
- Seating assignments.
- Day-of guest check-in.
- Waitlist or secondary invitation rounds.
- Guest photo uploads.
- Shared photo gallery.
- Digital guestbook.
- Playlist suggestions or voting.
- Weather information.
- Printable place cards or name labels.
- Vendor-specific reports and exports.
