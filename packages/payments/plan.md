# Payments And Entitlements Plan

## Vision

Templar projects should be able to add paid access quickly without rebuilding
payments, billing management, webhook handling, or entitlement logic for every
new app.

The target experience is:

> Give the agent a product idea, and it can create an app that supports login,
> payment, subscription management, deployment, and paid feature access using
> shared Templar primitives.

The payments package should therefore own more than a Stripe adapter. It should
connect payment events to app-level access decisions.

## Primary End User Stories

### Subscribe To A Plan

As a logged-in user, I can choose a paid plan, complete checkout through Stripe,
return to the app, and receive access to the paid features attached to that
plan.

### Start A Trial

As a logged-in user, I can start a trial for a paid plan, use the paid features
during the trial period, and transition into paid billing when the trial ends.

### Buy A One-Time Item

As a logged-in user, I can buy a one-time product or service, complete checkout
through Stripe, return to the app, and receive access to the purchased item or
result.

### Manage Billing

As a subscriber, I can manage my billing through a Stripe-hosted billing portal,
including canceling my subscription or updating payment details.

### Keep Access In Sync

As a user, my paid access updates when billing state changes, such as a
trial starting, trial ending, successful subscription renewal, failed payment,
cancellation, or subscription deletion.

### Return Later With Access Preserved

As a returning user, the app remembers what I have paid for and can decide
whether I still have access to paid features.

## Product Owner Stories

### Reuse One Stripe Account Across Projects

As the product owner, I can launch multiple projects from one existing Stripe
account while keeping each project logically separated.

Each project should have its own project key, products, prices, checkout
sessions, webhook handling, customer mapping, and entitlement records.

### Create A New Paid Project Quickly

As the product owner, I can define the paid offerings for a new app in code and
have the system create or reuse the necessary Stripe resources without visiting
the Stripe Dashboard for normal project setup.

### Avoid Disturbing Existing Products

As the product owner, creating a new project should not mutate unrelated Stripe
products, prices, subscriptions, or webhook behavior from existing products.

### Track Access By App Tenant

As the product owner, I can tell which app, tenant, user, plan, product, or
order a payment belongs to.

## App Developer Stories

### Start Checkout

As an app developer, I can ask the package to start checkout for either a
one-time purchase or subscription without directly assembling Stripe-specific
request shapes in app code.

### Open Customer Portal

As an app developer, I can send a logged-in subscriber to a billing management
page without building custom subscription cancellation or card update UI.

### Handle Verified Webhooks

As an app developer, I can pass raw Stripe webhook data to the package and have
it verify authenticity before changing payment or entitlement state.

### Check Entitlements

As an app developer, I can ask whether a user or tenant currently has a specific
entitlement before allowing access to a paid feature.

### List Entitlements

As an app developer, I can list a user or tenant's current paid access so the UI
can show plan state, purchased items, or available premium features.

### Test Paid Workflows

As an app developer, I can test app behavior around checkout, webhooks, and
entitlements without requiring live Stripe calls.

## Required Functional Areas

### Stripe Checkout

The package should support Stripe-hosted checkout for:

- one-time purchases
- recurring subscriptions
- subscription trials

Checkout should support app-owned context such as project key, user ID, tenant
ID, product key, plan key, order ID, and success/cancel return URLs.

### Trials

The package should support trial access for subscription plans.

Trial support should allow apps to:

- define that a plan has a trial
- grant entitlement access during an active trial
- distinguish trial access from paid subscription access
- update entitlement state when the trial converts, fails to convert, or is
  canceled

### Stripe Customer Portal

The package should support creating billing portal sessions for existing
customers so users can self-manage subscription billing.

### Webhook Verification

The package should verify Stripe webhook signatures before accepting billing
events as true.

Webhook handling is required because app access should not be granted based only
on a browser redirect after checkout.

### Normalized Billing Events

The package should translate relevant Stripe events into Templar-level payment
and subscription events.

Initial event coverage should include:

- checkout completed
- trial will end
- invoice payment succeeded
- invoice payment failed
- subscription created
- subscription updated
- subscription deleted

### Entitlement Storage

The package should maintain app-readable entitlement state.

Entitlements should answer:

- who has access
- what they have access to
- which project the access belongs to
- whether access is active
- what payment or subscription caused the access
- when access expires, if applicable

### Entitlement Queries

Apps should be able to query entitlement state directly for authorization and UI
purposes.

Important queries include:

- does this user or tenant have this entitlement?
- what entitlements does this user or tenant currently have?
- what billing source created this entitlement?

### Project Tenancy

The package should require project-level separation so several Templar projects
can safely share one Stripe account.

The project key should be a first-class concept in payment setup, checkout,
webhooks, entitlements, and reporting.

### Idempotent Setup

The broader payments system should support repeated setup runs without creating
duplicate products, prices, or webhook endpoints for the same project and
offering.

This is necessary for agent-driven app generation and deployment.

## Intentional Deferrals

These are not part of the first functional scope unless a real project needs
them.

### Refund Automation

Refunds can be handled manually in the Stripe Dashboard at first. Package
support is only needed when an app needs self-serve refunds, admin refund flows,
or automated entitlement changes from refunds.

### Coupons And Promotion Codes

Coupons can be configured in Stripe. Package support is only needed when apps
must dynamically create, apply, or reason about discounts.

### Metered Billing

Metered billing requires app usage tracking and usage reporting. This should be
added only when a product actually needs usage-based pricing.

### Advanced Tax Handling

Stripe Tax can be configured at the account/product level first. Package support
is only needed when apps need runtime tax decisions or product-specific tax
behavior.

### Stripe Connect

Connect is for marketplaces and platforms that route money to other parties. It
is not needed for normal Templar apps where users pay this business directly.

### Custom Payment Forms

Stripe Checkout should be the default. Custom PaymentIntent flows should wait
until an app has a strong product reason to own payment UI directly.

### Multiple Stripe Accounts Per Project

Multiple Stripe accounts may be useful for major projects that need separate
merchant identity, reporting, legal separation, or branding. The first version
should optimize for soft tenancy within one existing Stripe account.

## Initial Success Criteria

The first useful version is successful when a new Templar app can:

- define one subscription plan
- define trial behavior for that subscription plan
- define one one-time purchase
- create checkout sessions for both
- send subscribers to the billing portal
- verify Stripe webhooks
- update entitlement state from verified billing events
- check paid access for a user or tenant
- keep all Stripe resources namespaced by project key
