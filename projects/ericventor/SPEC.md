# EricVentor.com Spec

## Summary

EricVentor.com is a career-first personal site for Eric Ventor: a strong senior
full-stack/backend engineer building AI-native products, agent workflows, and
useful side projects.

The site should introduce Eric first, then Templar Labs as his product lab and
reusable launch system. Templar Labs is not the main identity; it is proof that
Eric builds systems that help him ship.

## Audience

Primary audience:

- Fellow engineers
- Hiring managers
- Friends and personal network

Desired first impression:

- Passionate about coding
- Capable and hirable
- Has personality
- Actively building, not stale

Deeper impression:

- Strong senior engineer with real scale and business impact
- Founder-engineer who ships zero-to-one products
- Publishes what he learns
- Fun and pragmatic to work with

## Positioning

Core positioning line:

> Software engineer building AI-native products and backend systems.

Supporting line direction:

> I am Eric Ventor, a senior engineer at Metropolis and founder of Templar Labs,
> where I build useful software, write about what I learn, and turn ideas into
> shipped projects.

Career emphasis:

- Strong senior engineer
- Capable founder-engineer
- AI-native product builder
- Backend-heavy full-stack engineer

Areas to emphasize:

- Full-stack AI product engineering
- Backend systems
- Agent workflows
- Practical product shipping

Areas not to overemphasize:

- DevOps as the core identity
- Frontend-only work
- Research roles

## Voice And Tone

The voice should be casual and direct.

Use:

- Plain language
- Specific proof
- Builder energy
- Honest status and numbers
- Light personality

Avoid:

- Clearly AI-generated text
- Startup manifesto copy
- Overly formal resume language
- Fake terminal or hacker aesthetics
- "Available for hire" funnel language unless actively true

## Visual Direction

Working blend:

- Editorial Engineer
- Personal Ops Console
- Product Lab Notebook

Default mode:

- Dark by default
- Light mode can exist, but dark is the primary brand environment

Recommended palette:

- Dark charcoal / graphite base
- Warm off-white text
- Muted slate surfaces
- Living green accent
- Signal amber for activity/status
- Restrained blue for links/data
- Avoid dominant purple AI-SaaS gradients

Visual assets:

- Mostly interface, typography, and diagrams
- Minimal/no portrait-driven branding
- Architecture diagrams and live status panels should carry the technical
  interest

Experimental level:

- About 6/10
- Interactive and technically interesting, but fast and controlled
- No scroll takeover, excessive animation, or heavy 3D intro

## Information Architecture

Primary nav:

- Projects
- Writing
- About
- Contact
- Resume

Global links:

- GitHub
- LinkedIn
- Twitter/X
- Resume:
  `https://github.com/ericvtheg/resume/raw/refs/heads/main/resume.pdf`

Pages:

- `/`
- `/projects`
- `/projects/:slug`
- `/writing`
- `/writing/:slug`
- `/about`
- `/contact`

There should be no `/now` page for v1. Live/current status belongs on the
homepage.

## Homepage

### Hero

The hero should include:

- Positioning headline
- Short Eric intro
- Primary CTAs: `View projects`, `Read writing`
- Secondary/global links: GitHub, LinkedIn, Twitter/X, Resume

The homepage should not open as a resume page or a Templar Labs landing page.
Eric comes first.

### Live Pulse

The Live Pulse should be prominent and visible near the top of the homepage. It
should be a polished dashboard/status panel, not a fake terminal.

Behavior:

- Snapshot on page load only
- No polling or websocket for v1
- Each item should show last updated/stale state where useful
- Failures should degrade gracefully

Items:

- GitHub recent activity across repos
- AI build activity: tokens used this month across Codex TUI, OpenRouter, and
  personal agents like OpenClaw/Hermes
- Personal product portfolio metrics: aggregate ARR and combined MAU
- Latest writing
- Homelab status
- L4D2 server status
- Minecraft server status, truthfully shown even if offline/paused

### Career Strip

The homepage should include a compact career strip with just enough information
to understand what Eric did.

Items:

- Metropolis: Senior Software Engineer, Java/Scala backend,
  JavaScript/Next.js/React frontend
- iFIT: backend TypeScript/Node systems for 1M+ MAU
- Disney: Python/serverless media app, $120k+ annual savings
- Sphere: co-founder/CTO, SaaS to $1.5k+ MRR

### Featured Projects

Featured projects should be equally weighted:

- MAKID
- Templar Labs
- Tubs
- Cardiff Split

Each project card should have one sharp proof line and a link to the project
page.

### Latest Writing And Newsletter

The homepage should include:

- Latest writing preview
- Newsletter signup for both posts and project updates

Signup copy should be broad, not only blog-specific. Direction:

> Get new posts and project updates when I ship something worth sharing.

## Project Positioning

### MAKID

MAKID is one commercial product proof within Eric's broader portfolio. It
should not dominate the homepage or define the overall portfolio story.

Emphasize:

- Business traction as one part of the wider portfolio
- Product story
- Product-level metrics where they add useful context
- Built from zero to one
- Music producer workflow/product angle

Technical architecture can appear, but it is secondary to the product and
business story.

### Templar Labs

Templar Labs is the strongest technical case study.

Emphasize:

- Reusable architecture
- Agent-friendly AI coding with guardrails
- Speed from idea to deployed app
- Shared packages and project conventions
- Cloudflare/Alchemy/TanStack pipeline
- Proof point: Cardiff Split shipped usable/deployed in 20 minutes

### Tubs

Tubs is Eric's homelab AI assistant.

Emphasize practical everyday AI, not novelty chatbot behavior.

Wins:

- Restaurant recommendations
- Homelab server management
- Trip planning
- Fitness trainer/workout tracking

There should be no live public interaction with Tubs.

### Cardiff Split

Cardiff Split proves the "rebuild tools that annoy you" and "ship fast" story.

Emphasize:

- Built for friends
- Free bill-splitting / Splitwise alternative
- Usable and deployed in 20 minutes

## Blog Migration

Existing blog content should be preserved as-is.

Migration rules:

- Migrate all existing MDX posts and public assets
- Keep original titles, descriptions, and dates
- Do not bring over old visual design, styling, or components
- URL preservation is not required
- Redirects are nice-to-have, not launch-blocking
- New URL structure: `/writing/:slug`

Blog v1:

- One simple reverse-chronological list
- Show date and reading time
- No public tags/categories
- No comments/reactions
- Publishing-only

MDX should support React components for future interactivity.

Future posts should prefer curated owned components:

- Figures/images
- Callouts
- Code blocks
- Diagrams
- Project metric embeds
- Live widgets
- Simple interactive demos

## Content Workflow

Use repo-backed MDX for v1 with lightweight helper tooling later.

Do not build a CMS/admin UI for v1.

Future helper workflow:

- Generate slug/frontmatter
- Validate metadata
- Assist image placement
- Support agent-friendly post creation

## Integrations

Integrations should expose curated public-safe data only.

### GitHub

- Show activity across all repos
- Public details can link to public commits/PRs/repos
- Private activity can be shown only as aggregate counts, if used
- Do not expose private repo names

### AI Token Usage

Public metric:

> Tokens spent building

Sources:

- Codex TUI
- OpenRouter
- Personal agents such as OpenClaw/Hermes

Implementation direction:

- Normalize usage events into a shared store
- Fields may include source, provider/model, input tokens, output tokens,
  total tokens, timestamps, project/repo, task type, and result
- Homepage should show aggregate monthly token usage as a Live Pulse detail
- Do not expose raw prompts, private repo names, logs, or secrets

### Personal Product Portfolio Metrics

Public metrics:

- Aggregate ARR across Eric's revenue-producing projects
- Combined monthly active users across Eric's active products

Implementation direction:

- Treat the portfolio, rather than any single product, as the homepage metric
  source
- Normalize project-level metric snapshots into one public portfolio summary
- Revenue providers such as Stripe should be accessed server-side only
- ARR should be derived from project subscription data, not exposed directly
  from the browser
- MAU can come from each project's analytics provider or application database,
  depending on its source of truth
- Define whether combined MAU is deduplicated across products or is the sum of
  project-level MAU; label it clearly if users may overlap
- Publish only sanitized aggregates
- Include last updated/stale state

### Homelab And Game Status

Only show curated statuses:

- Homelab online/offline
- L4D2 server online/offline
- Minecraft server online/offline/paused

Do not expose:

- Raw service names
- Container lists
- Ports
- Admin tools
- Internal topology

### Newsletter

Build a reusable `@templar/subscribers` package.

Requirements:

- Uses D1 via `@templar/db`
- Uses email via `@templar/email`
- One simple public list for v1
- No interest selection
- Double opt-in by default
- Configurable single opt-in for future projects if needed
- Supports source metadata internally

V1 package capabilities:

- Subscribe
- Confirm double opt-in
- Unsubscribe
- Resubscribe
- Store basic audit fields
- Send confirmation/welcome/unsubscribe emails

Campaign sending can wait until later unless needed.

### Contact Form

Use a generic contact form.

Fields:

- Name
- Email
- Message

Requirements:

- No direct email address published
- Sends through `@templar/email`
- Add spam protection with Cloudflare Turnstile preferred
- Honeypot plus rate limit is acceptable if Turnstile is deferred
- Optionally store a copy in D1 for audit/reliability

### Analytics

Use privacy-light PostHog through the existing `@templar/analytics` direction.

Track:

- Page views
- Newsletter signup submitted/confirmed
- Contact form submitted
- Project card clicks
- Resume clicks
- Social link clicks

Do not include session replay for v1.

## Deployment And Tech Plan

The project should live at `projects/ericventor`.

Deployment:

- Same Templar Labs Cloudflare/Alchemy pipeline as other projects
- Deploy from `main`
- Participate in root `pnpm check` and `pnpm run deploy`

Likely app stack:

- TanStack Start
- React
- Tailwind v4
- Cloudflare
- Alchemy
- Shared `@templar/ui`

Likely shared packages:

- `@templar/deploy`
- `@templar/db`
- `@templar/email`
- `@templar/analytics`
- New `@templar/subscribers`

## Phased Implementation Plan

### Phase 1: Spec And Brand

- Finalize `SPEC.md`
- Create/finalize `BRAND.md`
- Define homepage content model
- Define project metadata model
- Define blog migration rules
- Define public metrics contracts

### Phase 2: Static Site Foundation

- Scaffold `projects/ericventor`
- Build homepage, project pages, writing index/post pages, about, and contact
- Migrate blog content/assets
- Add resume/social links
- Use static/mock metric data first

### Phase 3: Core Integrations

- GitHub activity snapshot
- Aggregate portfolio ARR and combined MAU
- AI token usage aggregate shape
- Homelab/game status snapshot
- Stale/failure handling

### Phase 4: Newsletter And Contact

- Build `@templar/subscribers`
- Add double opt-in newsletter signup
- Add generic contact form
- Add email delivery
- Add spam protection

### Phase 5: Polish And Launch

- Visual polish
- Responsive checks
- Performance pass
- Accessibility pass
- SEO/social metadata
- Analytics events
- Deploy via Cloudflare/Alchemy

## Open Decisions

- Exact homepage copy
- Exact visual palette values
- Whether light mode ships in v1 or later
- Definition and project-level sources for combined portfolio MAU
- Source format for Codex/OpenRouter/personal-agent token usage
- Whether GitHub private aggregate activity is included
- Whether old blog URLs get redirects
- Exact `@templar/subscribers` API shape
- Whether contact messages are stored in D1 or only emailed

## Acceptance Criteria

- Site is career-first and clearly about Eric, not primarily Templar Labs
- Homepage communicates what Eric does within 30 seconds
- Site makes Eric feel capable, hirable, passionate, and personal
- Live Pulse makes the site feel current without leaking private infrastructure
- Homepage business metrics represent Eric's overall product portfolio rather
  than centering a single project
- MAKID, Templar Labs, Tubs, and Cardiff Split are equally represented as
  featured projects
- Blog content is migrated as-is with modern presentation
- Newsletter signup works with reusable subscriber infrastructure
- Contact form works without exposing email
- Site deploys through the existing Templar Labs Cloudflare/Alchemy pipeline
- Site is fast, visually polished, responsive, and not animation-heavy
- Copy feels casual/direct and not AI-generated
