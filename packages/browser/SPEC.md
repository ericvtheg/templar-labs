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
the repository's default runtime. The initial implementation should use Browser
Run's Playwright/CDP session interface rather than attempt to normalize every
high-level feature offered by Browser Run.

## Layered Architecture

The package should separate three concerns that browser platforms often bundle
together:

```text
Templar browser operations
  navigate / snapshot / click / extract
                    |
                    v
Templar-owned Playwright controller
                    |
                    v
Browser runtime
  Cloudflare Browser Run / remote CDP / local Chromium
```

`@templar/browser` owns one consistent implementation of browser operations
using Playwright. Runtime-specific code only provisions an isolated browser,
connects Playwright to it, and releases it. It does not reimplement navigation,
interaction, extraction, or artifact behavior for each runtime.

Use `BrowserRuntime` terminology for this narrow internal boundary rather than
a broad `BrowserDriver`. Conceptually, a runtime acquires a scoped browser lease
containing a connected Playwright browser and the cleanup operation required by
that runtime.

Potential runtimes are:

- Cloudflare Browser Run, which acquires a remote Chrome session through its
  binding or CDP endpoint.
- A future remote-CDP runtime, which connects to an owned Browserless, Steel,
  or Chromium service.
- A local runtime, which launches Chromium for development when that is more
  useful than Cloudflare's local emulation.

These runtimes are substitutable because they meet at the Playwright/CDP
session boundary. A provider that only exposes high-level browser or agent
operations and cannot provide an equivalent browser session is not a runtime
implementation for this package.

## Initial Runtime Strategy

The first implementation should support only Cloudflare Browser Run. Do not
create a generalized runtime interface, fallback chain, or provider-selection
API until a second runtime is required by a real consumer. The public browser
service is already the boundary that protects callers from this later internal
refactor.

Use Playwright for the initial operations even when Browser Run offers a
stateless Quick Action for the same general task. A screenshot, extraction, or
PDF operation performed against an active browser session has different cookie,
page-state, and lifecycle semantics from a one-shot provider endpoint.

Provider accelerators such as Quick Actions may be introduced later only when
they preserve the package operation's semantics. Unique provider behavior
should otherwise remain internal or be exposed through an explicit provider
integration after a real consumer needs it.

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
small internal runtime boundary when multiple runtimes exist. Provider session
identifiers, CDP endpoints, Playwright objects, connection protocols, and raw
response shapes stay internal.

Likely domain concepts include:

- browser session and page identity
- scoped browser lease and runtime lifecycle
- page snapshot and element reference
- browser action and action result
- extracted content and artifacts
- session state policy
- navigation and approval policy

Model-facing browser tools should be adapters over this package, not the
package's core API. A fake browser service should support deterministic workflow
and approval tests without launching a real browser.

## AI Controller Boundary

The base package is deterministic browser automation, not an autonomous browser
agent. The model may choose among typed browser operations, but the operations
themselves should have stable Playwright-backed behavior.

Intent-based controllers such as Stagehand, autonomous observe-plan-act loops,
and model-generated CDP or Playwright programs belong in `@templar/agent` or a
future higher-level adapter. They are controllers above a browser runtime, not
alternative runtime implementations.

`@templar/browser` must not depend on `@templar/sandbox`. If an agent generates
browser code, the agent layer may compose both capabilities by executing the
code in `@templar/sandbox` and exposing a restricted set of
`@templar/browser` operations to it.

## Non-Goals

- Web-wide discovery or source ranking; that belongs in
  `@templar/web-search`.
- A crawler-specific ingestion pipeline or private knowledge index.
- Circumventing access controls, bot protections, robots directives, or site
  terms.
- Replacing stable first-party integrations with brittle UI automation.
- Exposing the complete Playwright, Puppeteer, CDP, or provider API through a
  Templar wrapper.
- Normalizing high-level provider APIs that have different session or state
  semantics merely because they produce similar output.
- Hosting or deploying an owned Chromium service. That runtime is separate
  infrastructure and connects through the future remote-CDP boundary.

## Open Decisions

- Whether Browser Run should be accessed through its Worker binding or remote
  CDP endpoint in deployed Templar applications.
- Whether the first release needs a distinct local Chromium runtime.
- The exact internal lease and cleanup semantics needed before introducing a
  second runtime.
- The snapshot representation agents can use reliably without excessive token
  cost.
- How authenticated session state is encrypted, retained, revoked, and
  associated with a Templar user.
- Which interactions require approval by default and where approval decisions
  are enforced.
- Whether screenshots, PDFs, and downloads return bytes or `@templar/blob`
  references.
