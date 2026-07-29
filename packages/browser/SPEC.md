# Browser

## Status

Planning only. This directory intentionally contains no implementation or
workspace manifest yet.

## Purpose

`@templar/browser` will let applications and agents inspect and interact with
dynamic websites when search, content retrieval, or a first-party API is not
enough. It should cover authenticated navigation, form interaction, downloads,
screenshots, and browser-rendered extraction while keeping consumers isolated
from automation-provider details.

Cloudflare Browser Run is the intended default provider because Cloudflare is
the repository's default runtime. The package should build on a standard
browser automation model where practical so another remote or local browser
can be introduced after a real consumer requires it.

## Initial Capability Scope

- Create, reconnect to, and close isolated browser sessions.
- Open pages, navigate, wait for readiness, and inspect page metadata.
- Return compact, model-friendly page snapshots for reasoning and element
  selection.
- Perform explicit interactions such as click, type, select, scroll, upload,
  and keyboard input.
- Extract text, links, or caller-defined structured data from rendered pages.
- Capture screenshots and PDFs.
- Download files into caller-controlled artifact storage.
- Preserve session cookies or authenticated state only when explicitly scoped
  to a user and product.
- Support cancellation, deterministic cleanup, structured logging, tracing,
  and usage or cost metadata.

## Safety Model

- Prefer a first-party API or `@templar/web-search` for read-only work when
  either can satisfy the request reliably.
- Isolate browser state by user and trust boundary. Never reuse authenticated
  sessions across users.
- Classify actions as observational, mutating, or consequential. Require an
  approval policy before purchases, messages, publishing, deletion, account
  changes, or equivalent consequential actions.
- Restrict navigation, downloads, uploads, and public network access through
  caller-supplied policy rather than model judgment alone.
- Keep credentials outside model-visible messages and tool results.
- Bound session duration, action count, downloaded bytes, page content, and
  total browser time.
- Record enough action history and artifacts to audit failures without logging
  secrets or sensitive page contents by default.

## Package Boundary

The public API should express browser intent rather than expose a provider SDK.
It should be an Effect service with scoped sessions, typed domain errors, and a
small driver contract. Provider session identifiers, connection protocols,
automation-library objects, and raw response shapes stay inside the driver.

Likely domain concepts include:

- browser session and page identity
- page snapshot and element reference
- browser action and action result
- extracted content and artifacts
- session state policy
- navigation and approval policy

Model-facing browser tools should be adapters over this package, not the
package's core API. A fake driver should support deterministic workflow and
approval tests without launching a real browser.

## Non-Goals

- Web-wide discovery or source ranking; that belongs in
  `@templar/web-search`.
- A crawler-specific ingestion pipeline or private knowledge index.
- Circumventing access controls, bot protections, robots directives, or site
  terms.
- Replacing stable first-party integrations with brittle UI automation.
- Exposing the complete Playwright, Puppeteer, CDP, or provider API through a
  Templar wrapper.

## Open Decisions

- Whether the first release should use direct browser automation, an
  intent-based agent layer, or both behind separate operations.
- The snapshot representation agents can use reliably without excessive token
  cost.
- How authenticated session state is encrypted, retained, revoked, and
  associated with a Templar user.
- Which interactions require approval by default and where approval decisions
  are enforced.
- Whether screenshots, PDFs, and downloads return bytes or `@templar/blob`
  references.
