# Offscroll

Friends compete to doomscroll less and choose real-life rewards that matter to them.
Runs as a Breli-authenticated TanStack Start app on Cloudflare Workers with a project-owned D1 database.

## Run

From the repository root, with Node 24 and pnpm 11:

```sh
pnpm install
pnpm dev offscroll
```

Open `http://localhost:5188`. The dev command applies local migrations before starting Vite.
Local D1 state lives in `apps/web/.wrangler/state`; production uses Alchemy-managed bindings and migrations.
Local sign-in uses the existing `https://auth.breli.app` issuer and a development-only cookie secret.

## Included

- Breli SSO and separate, persistent user profiles
- Private invitation links for 7-, 14-, and 30-day challenges, with up to 32 participants
- Self-reported social app minutes, including valid zero-minute check-ins
- Daily goals, personal streaks, estimated reclaimed time, and seven-day usage charts
- Leaderboards that exclude missing check-ins rather than counting them as zero
- Custom rewards, completed results, shared offline wins, and a ten-minute break timer
- Responsive desktop and mobile layouts with keyboard-accessible dialogs
- An explicitly labeled, interactive signed-out preview stored only in that browser

Preview edits never enter an authenticated account. Preview storage resets on a new UTC day.

## Rules and boundaries

- Days start and end at midnight UTC; rankings compare closed days, not today's partial totals
- Every challenge day needs a check-in to rank. Late joiners must backfill from the challenge start
- Lowest complete average wins; equal totals share the win. A circle needs at least two participants to award a competitive reward
- Check-ins can be edited for 30 days, unless their challenge has finalized
- Results finalize after the UTC day following the challenge's end. Check-ins covered by a finalized challenge are locked
- Personal goals and baseline changes do not change existing challenge rules
- Reclaimed time is an estimate against the user's baseline, initially 120 minutes/day
- Check-ins and notes are visible only to participants in shared challenges, within their date ranges
- Anyone with an invitation link and a Breli account can join while the challenge is active. Share links privately
- Rewards are promises between friends, fulfilled offline; no money is collected or paid out
- This web app cannot read iOS Screen Time or Android Digital Wellbeing automatically, verify entries, or block other apps
- The break timer survives background-tab throttling but ends when its dialog closes

## Verify

```sh
pnpm --filter offscroll-web test
pnpm --filter offscroll-web typecheck
pnpm --filter offscroll-web test:e2e
pnpm --filter offscroll-web build
```

Unit tests exercise scoring, validation, preview storage, privacy, and the real Drizzle D1 driver
against SQLite. Playwright covers preview and authenticated multi-user workflows on desktop and mobile,
using synthetic, locally signed development sessions—not production accounts or provider-login bypasses.
It also verifies the Breli sign-in redirect; the live Google-provider handoff is not part of the local suite.

## Deploy

The main-branch CI pipeline runs checks and applies Alchemy-managed migrations.
The app is configured for `https://offscroll.breli.app` and reuses existing Cloudflare and Breli auth secrets.

```sh
pnpm --filter offscroll deploy
```

Manual deployment changes production infrastructure. Prefer the repository's main-branch CI workflow.
