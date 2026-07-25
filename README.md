# Templar Labs

Templar Labs is an LLC owned and operated by Eric Ventor.

This is managed by a single developer and is meant for side projects. 

The idea is to create a single place where I've solved most boilerplate/problems that can be reused.

## Local Development

Run `pnpm dev` to choose a project from the interactive launcher. Use `j`/`k`
or the arrow keys to move, then press Enter to start it. Partial project names
also work directly, such as `pnpm dev wedding`. Use `pnpm dev --all` to start
every project.

## Tech Stack

These are the current defaults for new packages and projects in this monorepo.

- TypeScript as the primary language
- Effect as the core application/runtime model for services, workflows, dependency injection, config, retries, error handling, logging, and observability
- TanStack Start for full-stack React apps
- Drizzle for database access and migrations
- Alchemy for TypeScript-native infrastructure as code
- Cloudflare as the default cloud/runtime target
- pnpm workspaces for package management
- Biome for formatting, import organization, and baseline linting
- Oxlint for fast JavaScript/TypeScript linting
- ESLint flat config only where framework-specific or type-aware rules are still needed
- Vitest for unit/integration tests
- Playwright for end-to-end tests on deployable apps
- Tailwind CSS v4 for styling
- Radix/shadcn-style owned components for UI primitives and app components
- Better Auth for authentication
- PostHog for product analytics, feature flags, session replay, and experiments
- OpenRouter behind a local `@templar/ai` provider adapter, so app code is not coupled directly to one model gateway
- Stripe Checkout/Payment Links first for payments, with deeper Billing/Connect integrations added only when needed
- Effect Logger as the application logging API
- Structured JSON logs as the default sink for Cloudflare/Node log ingestion
- Optional Pino bridge only for Node-specific transports
- OpenTelemetry later for traces and metrics once the first real apps need it
- Turbo for monorepo task orchestration unless the repo grows into workflows that justify Nx

## Deployment

Deploys run from GitHub Actions on the homelab self-hosted runner. Pushing to
`main` runs `pnpm check`, then `pnpm db:migrate:ci`, then
`pnpm run deploy`. Manual dispatches deploy every project with a project-level
`deploy` script; pushes to `main` additionally pass `--changed-since` against
the previous commit so only projects touched since the last deploy are
redeployed.

Alchemy state is stored remotely with `CloudflareStateStore` through
`@templar/deploy`. Local `.alchemy/` state is intentionally ignored and should
not be committed; CI is the deployment source of truth.

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ALCHEMY_STATE_TOKEN`
- `ALCHEMY_PASSWORD`
- `OPENROUTER_API_TOKEN`
- `TEMPLAR_AUTH_SECRET`

Keep backup copies of the Alchemy secrets in a password manager. GitHub
secrets are write-only after creation.

Critiques/reccomendations for the above?

Notes: would like to enable native code in some places when desired (for example swift? rust?). Small small desire to even use technologies like Java/Scala to learn more about them for work, but meh. Idk how realistic or how much it would make sense to have them live here.

## Goals

"Projects", a deployable (or multiple deployables). For example a single project that has a frontend + backend app. We would want to have shared libraries between them.

Stay cost efficient, while still being applicable for growing my applicable skills for jobs.

Leverage home server where reasonable. For example github action runners

Build postable social media content. Things I build should make interesting content. I want to grow my following. Platforms: X, LinkedIn, Reddit.

Increase developer velocity; leverage viral topics.

Minimize click ops. We want to move fast and enable things to be seamless.

Agent friendly. I want to be able to communicate with my agent to build something and it just goes and does it and launches it without any need for me.

## Example Projects

- Recipe builder powered by AI Agents
- AI agent that can build other apps. A Co founder.
- Upload measurements & symptoms of pain if applicable and a pair of shoes will be reccomended to you.
- Wings review app. Like pizza review but for wings.
- Fully managed deployment/rollout suite for electron

## Reference

A successul single monorepo that I created is /Users/ericvtheg/Documents/MAKID/makid-monorepo reference it to see. Overall I almost imagine this repo to be a monorepo of monorepo. Where top level we have projects and reusable tools/libs that are applicable to all side projects. While each project folder can have mutliple apps and also have shared libraries.
