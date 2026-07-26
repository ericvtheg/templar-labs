# Emma & Eric Wedding

Wedding website and RSVP system for Emma and Eric.

The site includes a responsive homepage, an interactive style board at `/style`,
a guest RSVP at `/rsvp`, and Google-protected household management and vendor CSV exports at
`/admin`.
Guests find their invitation with a full name and submit one complete household
response covering every named person and invited event. Wedding meal choices
are currently mock options; the rehearsal dinner is wired as a second event
whose details and menu can be filled in later.

The admin stores household contact and mailing details, named invitees,
per-person event invitations, and explicit plus-one permissions. It also shows
which households have responded, event headcounts, attendance choices, meal
choices, per-person dietary restrictions, and plus-one names.

```sh
pnpm --filter emma-eric-wedding dev
```

The `/admin` route authenticates through the local Templar Auth service on port `5181`, so run
`pnpm --filter templar-auth dev` alongside Emma when testing the complete local sign-in flow.
Emma does not receive Google credentials, maintain canonical identity tables, or create local user
rows. It uses the database-free `createTemplarAuthApp` integration. Admin access comes from the
centrally signed global `admin` claim, and no sign-in UI is shown outside `/admin`.

The RSVP requires a confirmation email address. A save is atomic and remains
successful even if email delivery fails. Production makes one best-effort send
from `rsvp@ericventor.com`; local development skips delivery. There is
intentionally no queue, retry flow, or manual resend in this release.

The production target is `emmaand.ericventor.com`. The draft is marked
`noindex` and disallowed by `robots.txt` while privacy and guest access are still
being designed.
