# Payments And Entitlements Decisions

## Product Scope

- `@templar/payments` should include payments and entitlements.
- Entitlements are necessary because the package should answer whether a user can
  access a paid feature right now.
- The initial scope supports:
  - one subscription plan
  - one lifetime one-time purchase
  - both granting the same entitlement
  - card-required subscription trials
  - Stripe Checkout
  - Stripe Customer Portal
  - verified Stripe webhooks
  - local entitlement storage and queries
- Sales/checkout entry points are product-app concerns and are out of scope for
  the shared package/scaffold.

## Users And Access

- Billing and entitlements are user-level in the initial version.
- Tenant/team/workspace billing is out of scope for the initial version.
- Checkout requires a logged-in user.
- Anonymous checkout and later account linking are out of scope.
- Feature gates should be included.
- Feature gates should fail closed by default.
- Feature gate results should include a reason, not only allow/deny.

## Subscriptions

- The first version supports exactly one subscription plan per project.
- A user can have only one active subscription per project.
- Plan changes should happen through Stripe Customer Portal, not custom app
  checkout flows.
- If a user cancels in the Customer Portal, access should continue until the
  current paid period ends.
- Subscription payment failure should use a grace period.
- The default grace period is 7 days.

## Trials

- Trials are in scope.
- Trials require a card up front.
- Trial access starts immediately.
- Trial access should transition into paid access when billing succeeds.
- Entitlement state should update when a trial converts, fails to convert, or is
  canceled.

## Lifetime One-Time Purchase

- The one-time purchase is modeled as a lifetime purchase.
- A lifetime purchase grants the shared entitlement forever by default.
- Duplicate lifetime purchases should be prevented once the user already has
  the lifetime entitlement.
- The first version supports exactly one lifetime product per project.
- A user who already bought lifetime should be prevented from starting a
  subscription.
- The subscription-to-lifetime migration case is intentionally out of scope for
  the first version.

## Shared Entitlement

- The subscription and lifetime purchase grant the same entitlement.
- If a user buys lifetime, they keep access forever even if they later cancel a
  subscription.

## Stripe Account And Project Separation

- Multiple projects should reuse the existing Stripe account through soft
  tenancy.
- Each project has its own database by default. Apps within that project reuse
  the project backend/service layer and source-of-truth database.
- Local database tables do not need an app scope column for tenancy.
- `projectKey` should still be included for Stripe resource namespacing and
  Stripe metadata.
- Prices and products should not be shared across apps.
- Stripe resources should be namespaced by project key.

## Manifest And Provisioning

- The first version should include a payments/offering manifest.
- The manifest shape should be narrow:
  - one subscription plan
  - optional card-required trial behavior for that plan
  - one lifetime one-time purchase
  - one shared entitlement key
- Product name and description should live in the manifest alongside keys and
  prices.
- Prices should be fixed amounts in code, not manually supplied Stripe price
  IDs.
- When a manifest price changes, provisioning should always create a new Stripe
  Price.
- Old prices for the same app/offering should be deactivated automatically for
  new checkout use.
- Existing subscriptions may continue using old prices until changed through
  Stripe behavior.
- Provisioning only needs to target live Stripe mode for now.
- Payments provisioning should run automatically as part of deploy.
- Deploy should fail if payments provisioning fails.

## Promotion Codes

- Stripe-hosted promotion codes are in scope.
- Promotion codes should be allowed for both subscription checkout and lifetime
  checkout.
- `allowPromotionCodes` should default to `true`.

## Entitlement And Billing Storage

- `@templar/payments` should own its Drizzle schema and migrations, similar to
  `@templar/auth`.
- The schema should be one-size-fits-all for Templar apps where practical.
- Store local records for:
  - Stripe customers
  - subscriptions
  - lifetime purchases
  - entitlements
  - processed Stripe events
- Store processed Stripe event IDs so webhook retries are idempotent.
- Store event ID, event type, received timestamp, processing status, and
  normalized object IDs/statuses.
- Do not store full raw Stripe event payloads by default.
- All entitlement changes should come from Stripe events in the first version.
- Admin/manual entitlement grant or revoke is out of scope.

## Webhooks

- Entitlement changes should happen only from verified webhooks.
- The success page should not grant access.
- If webhook processing is delayed, the success page should show a processing
  state and poll until entitlement appears.
- The payments package does not need to store a pending checkout state for that
  UI.
- Webhook processing should be synchronous in the first version.
- If webhook processing partially fails, the package should return non-2xx so
  Stripe retries.
- Webhook handling should be all-or-nothing in a database transaction: processed
  event record, customer/subscription/purchase records, and entitlement updates
  should commit together.

## Database And Drivers

- The implementation should be Drizzle-specific.
- Follow the repo's existing driver/provider patterns where practical.
- Target the current Cloudflare/D1 direction first while keeping package
  boundaries consistent with other provider-backed packages.

## Route And UI Conventions

- Include TanStack Start route helpers for standard checkout, portal, and
  webhook behavior.
- Keep route helpers thin; the core package should still expose lower-level
  service methods.
- Payment UI components should live in `@templar/ui`, not `@templar/payments`.
- A standard authenticated billing settings page pattern is useful.
- `/settings/billing` is a post-purchase billing/account surface, not a sales
  surface.
- Users with no payment history should see an empty billing state rather than a
  404 or redirect.

## Intentional Deferrals

- Tenant/team/workspace billing.
- Anonymous checkout.
- Multiple subscription plans.
- Multiple lifetime products.
- Subscription-to-lifetime migration flow.
- Admin/manual entitlement overrides.
- Custom payment forms.
- Stripe Connect.
- Metered billing.
- Advanced dynamic tax behavior.
- Refund automation.
