# Emma & Eric Wedding

Wedding website and RSVP system for Emma and Eric.

The site includes a responsive homepage, an interactive style board at `/style`,
a guest RSVP at `/rsvp`, a scoped visual website editor at `/edit`, and Google-protected household
management and vendor CSV exports at `/admin`.
Guests find their invitation with a full name and submit one complete household
response covering every named person and invited event. Wedding meal choices
are currently mock options; the rehearsal dinner is wired as a second event
whose details and menu can be filled in later.

The admin stores household contact and mailing details, named invitees,
per-person event invitations, and explicit plus-one permissions. It also shows
which households have responded, event headcounts, attendance choices, meal
choices, per-person dietary restrictions, and plus-one names.
Guests can also leave one optional household message for Emma and Eric; it is
preserved with RSVP revisions and shown in the admin, confirmation email, and
CSV export.

The RSVP deadline defaults to August 15, 2027 and is shown on the guest page.
Administration can change the date or close full editing early. The deadline is
evaluated in Wichita time and remains open through the end of the displayed day.
After full editing closes, submitted households can still cancel attendance,
but late acceptances, meal changes, and other edits require Emma or Eric. Late
cancellations send a best-effort notification to `rsvp@ericventor.com`.

```sh
corepack enable
pnpm install
pnpm --filter emma-eric-wedding dev
```

Use Node 24.15.x (see the root `.nvmrc`) and pnpm 11.

The `/admin` route authenticates through the local Templar Auth service on port `5181`, so run
`pnpm --filter templar-auth dev` alongside Emma when testing the complete local sign-in flow.
Emma does not receive Google credentials, maintain canonical identity tables, or create local user
rows. It uses the database-free `createTemplarAuthApp` integration. The central callback issues a
signed app session to normal authenticated users as well as administrators, so an editor can use
their own account without becoming a global administrator.

## Visual editor access

`/edit` uses [Puck](https://puckeditor.com/docs) with the existing garden React components. Editors
can drag sections in the canvas or outline, use the keyboard order controls, edit structured text and
lists, add HTTPS/site-relative photo blocks, and preview 390 px mobile or 1280 px desktop output.
There is no arbitrary HTML, JavaScript, or CSS field. Server validation rejects unknown properties,
unsafe links, non-HTTPS remote images, duplicate block IDs, oversized text, and oversized documents.

Access is wedding-specific. Set `WEDDING_EDITOR_EMAILS` to a comma-separated list of verified Google
account emails in the local environment or deployment secret store. Do not commit real addresses.
No address is supplied by the repository, and an empty/missing allowlist denies every non-admin user.
The signed global `admin` claim retains bootstrap/support access but the allowlist never grants global
admin rights. Access is checked server-side for the editor load and every save, publish, or restore.

```sh
export WEDDING_EDITOR_EMAILS="authorized-account@example.com"
pnpm --filter templar-auth dev
pnpm --filter emma-eric-wedding dev
```

Production setup requires supplying `WEDDING_EDITOR_EMAILS` to the deployment environment before
running the existing project deployment. Changing it requires a redeploy. The app-local callback is
already `/api/auth/callback`; the central auth service permits that standard callback on the existing
`ericventor.com` first-party domain and HTTP loopback callbacks for local development.

## Drafts, publishing, and migrations

Drafts, published content, and the latest 30 revision records are stored in the existing wedding D1
database. Saving a draft does not change the public homepage. Publish validates and copies the current
editor payload to the public column. Public requests select only that published column; before the
first publish they render the original static homepage. Restoring history creates a new draft revision
and never republishes automatically. Compare-and-swap document versions plus a unique revision version
prevent two editor sessions from silently overwriting one another.

Migration `db/migrations/0007_free_raza.sql` adds only `wedding_site_documents` and
`wedding_site_revisions`; it does not alter RSVP/admin tables. It is wired through the existing
Alchemy D1 deployment resource. Do not run a production migration independently of the reviewed
deployment. For local development, start the project through Alchemy so it creates
`apps/web/.alchemy/local/wrangler.jsonc` and provisions the local D1 state before standalone builds.

Useful verification commands:

```sh
pnpm --filter emma-eric-wedding-web test
pnpm --filter emma-eric-wedding-web typecheck
pnpm --filter emma-eric-wedding typecheck
pnpm --filter emma-eric-wedding-web build
```

The standalone Vite build requires Alchemy's generated local Wrangler file. No production migration
or deploy is performed by these commands.

The RSVP requires a confirmation email address. A save is atomic and remains
successful even if email delivery fails. Production makes one best-effort send
from `rsvp@ericventor.com`; local development skips delivery. There is
intentionally no queue, retry flow, or manual resend in this release.

The production target is `emmaand.ericventor.com`. The draft is marked
`noindex` and disallowed by `robots.txt` while privacy and guest access are still
being designed.
