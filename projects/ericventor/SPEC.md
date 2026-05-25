# Ericventor.com Product Spec

## Goal

Build `ericventor.com` into an impressive personal site that functions as:

- A high-signal portfolio for engineering credibility.
- A blog that is easy to add to.
- A live project and activity hub.
- A playground for reusable Templar Labs packages.

The site should carry over content from `/Users/ericvtheg/Code/blog` without reusing its styling, layout, or components.

## Current Inputs

Existing blog repo:

- Location: `/Users/ericvtheg/Code/blog`
- Framework: Next.js 13, Contentlayer, Tailwind CSS
- Content source: `content/posts/*.mdx` and `content/pages/*.mdx`
- Posts found:
  - `ai-in-music.mdx`
  - `beta-test-songs.mdx`
  - `claude-code-plugin-for-solo-founders.mdx`
  - `former-highschool-career-presentation.mdx`
  - `hello-world.mdx`
  - `leveraging-vector-stores-for-LLM-prompts.mdx`
  - `making-the-most-of-ec2-free-tier.mdx`
  - `mobx-state-tree.mdx`
  - `prisma-migrations-private-subnet.mdx`
  - `self-hosted-claude-code-runner.mdx`
  - `transactions-are-a-leaky-abstraction.mdx`
- Page content found:
  - `about.mdx`
- Assets to migrate:
  - `ai-in-music-cover.png`
  - `betatestsongs_schema.png`
  - `blog-post-*.jpg`
  - `claude-code-runner-dashboard.png`
  - `claude-code-runner-logs.png`
  - `cover-art-ai-generated.png`
  - `cover-art-vector-db-llm.png`
  - `highschool-presentation.jpg`
  - `me.jpeg`
  - `tree-with-nodes.webp`
  - `two-targets.png`
  - `two-tasks-running.png`

Existing monorepo packages worth using:

- `@templar/ui` for shared React UI components.
- `@templar/deploy` for Cloudflare deployment conventions.
- `@templar/analytics` for PostHog-style event tracking.
- `@templar/blob` for R2-backed media or generated assets.
- `@templar/db` for D1-backed dynamic site data.
- `@templar/ai` for optional AI-assisted features.
- `@templar/email` for contact, newsletter, or reply flows.
- `@templar/queue` for background refresh jobs.

## Recommended Stack

Use a TanStack Start app inside `projects/ericventor/apps/web`, matching the existing Templar project style.

Recommended dependencies:

- TanStack Start and Router for the app.
- Tailwind CSS v4.
- `@templar/ui` for primitives.
- MDX content pipeline owned by this project.
- Cloudflare Workers deployment through `@templar/deploy`.
- Optional D1/R2 bindings for dynamic integrations.

Avoid bringing over:

- Next.js app structure.
- Contentlayer-generated code.
- Existing blog CSS/components/theme toggle.

## Information Architecture

### Homepage

Purpose: immediately communicate "this person ships serious software and writes clearly."

Sections:

- Hero: name, positioning, primary links, and a live "currently building" strip.
- Operating Desk: interactive dashboard summarizing posts, projects, GitHub activity, and experiments.
- Featured Work: MAKID, BetaTestSongs, Solo Founder Toolkit, Claude Code Runner, Templar Labs.
- Writing: latest posts with tags and short notes.
- Activity: recent GitHub commits, releases, or public repo events.
- Contact: concise routes to GitHub, LinkedIn, X, email, and resume.

### Blog

Routes:

- `/writing`
- `/writing/:slug`
- `/topics/:topic`
- `/rss.xml`
- `/sitemap.xml`

Authoring model:

- Add new posts as MDX files in `projects/ericventor/content/posts`.
- Keep frontmatter minimal:

```yaml
---
title: "Post Title"
description: "Short search/social summary."
date: "2026-05-25"
tags: ["systems", "ai", "product"]
featured: false
draft: false
coverImage: "/content/post-cover.png"
---
```

Blog requirements:

- MDX rendering with project-local components.
- Code block styling.
- Table of contents on desktop for long posts.
- Reading time.
- Related posts by tag.
- RSS feed.
- Social preview metadata.
- Legacy slug redirects where needed.
- Search/filter by topic.

### Projects

Routes:

- `/projects`
- `/projects/:slug`

Project fields:

- Name
- One-line value proposition
- Status: live, archived, writing, prototype
- Year
- Role
- Stack
- Links
- Screenshots/media
- What it does
- What was technically interesting
- What changed after launch

Recommended featured projects:

- MAKID
- BetaTestSongs
- Claude Code Runner
- Solo Founder Toolkit
- Cardiff Split
- Templar Labs

### Activity

Routes:

- `/activity`

Purpose: show proof of current building without requiring manual updates.

MVP:

- Pull public GitHub activity for `ericvtheg`.
- Show recent public commits, PRs, releases, and repos.
- Cache server-side to avoid rate-limit pain.
- Link to the source event or repo.

Better version:

- Scheduled refresh into D1 or KV.
- Aggregate commits by repo and day.
- Highlight "shipped this week" changes from selected repos.
- Add manual annotations so raw commits can become human-readable updates.

Potential GitHub data sources:

- GitHub public events API for fast MVP.
- GitHub GraphQL API for richer pinned repo, contribution, and PR data.
- Static build-time fetch for low-maintenance first launch.

### Lab

Routes:

- `/lab`

Purpose: a fun area that makes the site feel alive and lets the monorepo packages shine.

Ideas:

- "Build console": a fake-but-data-backed terminal showing recent posts, projects, and GitHub events.
- "Project graph": interactive graph linking posts, repos, packages, and products.
- "Stack explorer": clickable map of Templar packages and where they are used.
- "Ask my writing": AI search over blog posts using `@templar/ai` later.
- "Release notes": generated timeline from commits plus hand-authored notes.

## Homepage Concept

Working title: `Eric Ventor OS`

Above the fold:

- Left: name, crisp positioning, links.
- Right/full bleed: live workbench with three columns:
  - `Now`: current focus and recent GitHub activity.
  - `Shipped`: featured projects.
  - `Wrote`: latest essays.

Primary interaction:

- A command-palette button opens quick navigation: Writing, Projects, Activity, Resume, GitHub, Contact.

Why this is stronger than a normal portfolio:

- It proves ongoing activity.
- It makes older blog content feel current.
- It lets project work, writing, and code reinforce each other.
- It creates a memorable artifact instead of a static resume page.

## Integration Ideas

### GitHub Activity

MVP:

- Fetch public events for `ericvtheg`.
- Cache for 30 to 60 minutes.
- Render activity rows with repo, action, timestamp, and link.

V2:

- Use a scheduled queue worker to refresh activity into D1.
- Add repo allowlist so the feed emphasizes meaningful work.
- Add "release note" annotations stored in MDX or D1.

### Blog Search

MVP:

- Static client-side search over title, description, tags, and excerpt.

V2:

- Semantic search over posts with `@templar/ai`.
- "Ask my writing" page that answers from posts with citations.

### Contact

MVP:

- Links only.

V2:

- Contact form using `@templar/email`.
- Anti-spam honeypot and rate limit.

### Analytics

Use `@templar/analytics` for:

- Page views
- Blog post reads
- Project link clicks
- Command palette actions
- Contact link clicks

### Media

MVP:

- Store migrated images in the web app `public` directory.

V2:

- Store larger assets in R2 through `@templar/blob`.
- Use generated social images per post.

## Content Migration Plan

1. Create `projects/ericventor/content/posts`.
2. Copy MDX posts from `/Users/ericvtheg/Code/blog/content/posts`.
3. Copy `about.mdx` into either `content/pages/about.mdx` or convert it into a typed profile data file.
4. Copy referenced public assets into the new app's `public` directory.
5. Normalize frontmatter:
   - Add `tags`.
   - Add `coverImage` when relevant.
   - Add `updatedAt` only when a meaningful update exists.
   - Add `canonicalUrl` only if old URLs need explicit canonical metadata.
6. Audit embedded raw HTML:
   - Preserve images.
   - Replace unsupported iframe/script blocks with safe MDX components.
   - Turn the Twitter embed in `mobx-state-tree.mdx` into a static linked quote or custom embed component.
7. Add redirects for old slugs if route structure changes.

## Build Phases

### Phase 1: Impressive Static Launch

- TanStack Start app scaffold.
- Brand system and responsive layout.
- Blog import and MDX rendering.
- Project data model and featured project pages.
- Homepage workbench with static activity placeholders.
- SEO metadata, sitemap, RSS, robots.
- Deploy to `ericventor.com`.

### Phase 2: Live Integrations

- GitHub activity feed.
- Cached server function or D1/KV-backed refresh.
- Post search and topic pages.
- Analytics events.
- Contact links or form.

### Phase 3: Signature Features

- Interactive project graph.
- Ask-my-writing AI search.
- Auto-generated social cards.
- Build log/release notes from selected repos.
- Newsletter or email subscription.

## Acceptance Criteria

- The first viewport clearly says who Eric is and what he builds.
- Existing blog posts are reachable and readable.
- Adding a post requires only adding an MDX file and assets.
- Site works well on mobile and desktop.
- No reused visual styling from the old blog.
- Project pages make shipped work easy to scan.
- GitHub integration is designed so it can degrade gracefully if API limits or tokens fail.
- Deployment fits the existing `@templar/deploy` Cloudflare pattern.

## Open Decisions

- Whether `/` should be portfolio-first or writing-first. Recommendation: portfolio-first with writing prominently integrated.
- Whether the blog route should be `/blog` or `/writing`. Recommendation: `/writing`, with `/blog/*` redirects if needed.
- Whether to require a GitHub token. Recommendation: no token for launch, token-backed richer feed later.
- Whether to use D1 on day one. Recommendation: skip for Phase 1 unless GitHub caching is included immediately.
- Whether to expose resume PDF locally or link to GitHub. Recommendation: host a polished local PDF and keep GitHub as secondary.
