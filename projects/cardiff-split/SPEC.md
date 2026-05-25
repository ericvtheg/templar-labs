# Cardiff Split Product Spec

## Summary

Cardiff Split is a mobile-first web app for splitting trip expenses with friends. It is a fast, free, ad-free alternative to Splitwise and Spliito focused on low-friction shared trip links, clean balance summaries, and privacy-conscious usage without accounts.

The v1 product tracks expenses and settlements only. It does not move money, require sign-in, show ads, or lock core features behind a paid tier.

## Positioning

### Target Audience

Primary v1 audience: friend groups traveling together.

Common use cases:

- Weekend trips
- Bachelor/bachelorette trips
- Shared Airbnbs
- Group dinners during travel
- Road trips
- One-off shared travel events

### Product Promise

Split trip expenses in seconds with no accounts, no ads, and no premium lockouts.

### Name

Working product name: Cardiff Split.

The name should be used as a standalone product brand, not as a Templar Labs-branded subfeature. Templar Labs can remain in the footer, legal, or about surface.

## Branding

Cardiff Split should be trustworthy and practical without feeling plain or corporate. The visual anchor is a house/castle mark inspired by Cardiff Castle, representing a shared home base for a trip group.

Brand direction lives in [BRAND.md](BRAND.md). The first-pass SVG mark lives at [assets/cardiff-split-mark.svg](assets/cardiff-split-mark.svg).

Recommended launch tagline:

> Fast, private trip splitting with friends.

## Product Principles

- Fast first: create a trip, add people, add expenses, and share the link with minimal ceremony.
- Mobile-first: the main experience should be comfortable on a phone during a trip.
- No accounts in v1: anyone with the private trip link can participate.
- Privacy-conscious: collect the least data needed to make trips work.
- Clear summaries: users should always understand who paid, who participated, and what remains owed.
- Free and ad-free: no ads, no freemium restrictions, no paywalled core flow.

## V1 Scope

### Included

- Create a trip without an account
- Share a private, unlisted trip link
- Add trip participants by name
- Assign random default avatar/color per participant
- Allow participant avatar/color customization
- Add expenses
- Edit expenses
- Delete expenses
- Record manual settlements through recommended "mark paid" actions
- Edit/delete settlement records if needed
- Show activity history for trip changes
- Calculate balances in USD
- Support equal, exact amount, and percentage splits
- Exclude participants from individual expenses
- Automatically simplify debts into the fewest recommended settlement payments
- Allow anyone with the link to edit the trip

### Excluded

- User accounts
- Email verification
- Native iOS or Android apps
- Real money movement
- Venmo/Cash App/Zelle integrations
- Categories
- Multiple currencies
- Multiple payers on a single expense
- Trip deletion
- Hard trip completion state
- Paywalls
- Ads

## V1.1 Scope

### Receipt Photo Scanning

Receipt photo scanning is a v1.1 feature after the manual expense flow is solid.

Potential capabilities:

- Upload or take a receipt photo
- Extract merchant/title, total, tax, tip, and date
- Let user review extracted values before saving
- Optionally help split itemized receipts later

Implementation should use the existing `@templar/ai` package and should not block the v1 manual expense path.

## Core User Flows

### Create Trip

1. User lands on Cardiff Split.
2. User enters a trip name.
3. App creates a private, unlisted trip URL.
4. User adds participant names.
5. User shares the trip link with friends.

### Add Expense

1. User taps add expense.
2. User enters title, amount, date, payer, and participants included in the split.
3. User chooses split method:
   - Equal
   - Exact amounts
   - Percentages
4. App validates that exact amounts or percentages reconcile to the total.
5. App saves expense and updates balances.
6. Activity feed records the change.

### Edit Or Delete Expense

1. User opens an expense.
2. User edits fields or deletes it.
3. App recalculates balances.
4. Activity feed records the change.

### Settle Up

1. User taps "Settle up".
2. App shows simplified recommended payments.
3. Each recommended payment has a "Mark paid" action.
4. Marking paid records the full recommended payment as a settlement ledger entry.
5. Balances recalculate.
6. Activity feed records the settlement.

Partial payment is not supported in v1. If someone paid part of a recommendation, they should add a manual settlement or wait until the full payment is made, depending on final UI.

## Permissions Model

V1 uses link-based access:

- Trip links are private and unlisted.
- Anyone with the trip link can view and edit.
- No email verification.
- No owner/admin role.
- No participant claiming.

This is intentionally simple for friend trips. The UI should make this clear near share controls.

## Data Model

### Trip

- `id`
- `slug` or unguessable public token
- `name`
- `currency`: fixed to `USD` in v1
- `createdAt`
- `updatedAt`

### Participant

- `id`
- `tripId`
- `name`
- `avatarType`
- `avatarValue`
- `color`
- `createdAt`
- `updatedAt`

### Expense

- `id`
- `tripId`
- `title`
- `amountCents`
- `payerParticipantId`
- `expenseDate`
- `splitMethod`: `equal`, `exact`, or `percentage`
- `createdAt`
- `updatedAt`

Each expense has exactly one payer. If two people paid parts of one real-world bill, users should add two expenses.

### Expense Split

- `id`
- `expenseId`
- `participantId`
- `amountCents`
- `percentageBasisPoints`

Only participants included in the expense have split rows.

For equal splits, persisted split rows should still store computed cents so historical math remains stable.

### Settlement

- `id`
- `tripId`
- `fromParticipantId`
- `toParticipantId`
- `amountCents`
- `createdAt`
- `updatedAt`

Settlements are manual ledger entries created by marking a recommended payment as paid. They reduce outstanding balances.

### Activity Event

- `id`
- `tripId`
- `actorLabel`
- `eventType`
- `entityType`
- `entityId`
- `summary`
- `metadataJson`
- `createdAt`

Because v1 has no accounts, `actorLabel` can be lightweight. The UI may ask "Who is making this change?" before sensitive actions, or default to "Someone" if that adds too much friction.

## Balance Logic

### Ledger Calculation

Expenses:

- Payer receives credit for the full amount.
- Included participants owe their split amounts.

Settlements:

- Sender receives debit relief.
- Receiver receives reduced credit.

### Simplified Payments

The settle-up algorithm should:

1. Compute each participant's net balance.
2. Separate creditors and debtors.
3. Match largest debtor to largest creditor until all balances reach zero.
4. Round in cents only.
5. Return the fewest practical payments.

The simplified payments are read-only recommendations until a user taps "Mark paid".

## UX Requirements

### Mobile-First Screens

- Trip overview
- Add/edit participant
- Add/edit expense
- Expense detail
- Settle up
- Activity history
- Share trip

### Trip Overview

The overview should prioritize:

- Trip name
- Total spent
- Participant balances
- Recent expenses
- Primary add expense action
- Settle up action

The settle-up action should be available at any time. There is no completed trip state in v1.

### Expense Entry

Expense entry should be optimized for a phone:

- Large numeric amount input
- Quick payer selector
- Participant chips with selected/unselected states
- Split method segmented control
- Clear validation for exact and percentage splits

### Activity History

Activity should be visible but not dominate the main trip screen. It should answer:

- What changed?
- When did it change?
- Which participant/person label made the change, if known?

## Privacy And Retention

- Trips persist indefinitely.
- Trips cannot be deleted in v1.
- Individual expenses and settlements can be edited/deleted.
- No accounts are required.
- No ad tracking.
- Analytics, if used, should avoid collecting participant names, expense titles, or exact private trip contents.
- Public trip tokens must be unguessable.

## Technical Direction

This should live as a new project in the existing monorepo:

```txt
projects/cardiff-split/
  alchemy.run.ts
  templar-bindings.ts
  db/
    schema.ts
    migrations/
    db.config.mjs
    drizzle.config.ts
  apps/
    web/
```

Recommended stack based on the repo defaults:

- TanStack Start for the web app
- React for UI
- Tailwind CSS v4
- Drizzle for schema and migrations
- Cloudflare/D1 for persistence
- Alchemy for deployment
- Existing `@templar/ui` primitives where useful
- Existing `@templar/analytics` only with privacy-safe events
- Existing `@templar/ai` for v1.1 receipt scanning

## Analytics

Only collect product-health events that do not include sensitive trip data:

- `trip_created`
- `participant_added`
- `expense_added`
- `expense_edited`
- `expense_deleted`
- `settle_up_viewed`
- `settlement_marked_paid`
- `share_link_opened`

Avoid sending:

- Participant names
- Trip names
- Expense titles
- Amounts
- Private link tokens

## MVP Milestones

### Milestone 1: Core Local Prototype

- Static/mobile-first UI
- In-memory or local mock data
- Add participants
- Add expenses
- Balance and settle-up calculations

### Milestone 2: Persistent Trip Links

- D1 schema
- Create trip
- Load trip by unguessable token
- Persist participants, expenses, settlements, and activity

### Milestone 3: Production Polish

- Edit/delete flows
- Share UI
- Empty states
- Validation states
- Privacy-safe analytics
- Responsive desktop layout
- Basic Playwright coverage for primary flows

### Milestone 4: Launch

- Deploy through existing Templar Labs Cloudflare/Alchemy pipeline
- Add product metadata
- Add simple privacy policy language
- Run full `pnpm check`

### Milestone 5: V1.1 Receipt Scanning

- Receipt upload UI
- AI extraction
- Review-before-save flow
- Failure and correction states

## Open Questions

- Should the app ask users to identify "who is making this change" for activity history, or keep all activity anonymous?
- Should settlement records be editable directly, or only deletable and re-created?
- Should trip names be required, or can a trip start as "Untitled trip"?
- Should the first screen be create-trip only, or also allow opening/rejoining recent trips stored in local browser history?
- Should duplicate participant names be blocked?
