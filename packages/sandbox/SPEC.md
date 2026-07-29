# Sandbox

## Status

Planning only. This directory intentionally contains no implementation or
workspace manifest yet.

## Purpose

`@templar/sandbox` will give applications and agents a safe, opinionated way to
run untrusted or generated code in isolated environments. It should support
coding agents, data analysis, build and test execution, file transformation,
and temporary application previews without coupling consumers to a container
provider.

Cloudflare Sandbox is the intended default provider because Cloudflare is the
repository's default runtime. A provider boundary should remain possible for a
future hosted or local implementation when a real project needs one.

## Initial Capability Scope

- Create, reconnect to, and destroy isolated sandboxes.
- Execute one-shot commands with a working directory, environment, timeout,
  exit status, stdout, and stderr.
- Run stateful execution sessions when commands must share shell state.
- Read, write, list, and remove files inside a sandbox-owned workspace.
- Start, inspect, and stop background processes.
- Expose a temporary HTTP service through a preview URL when explicitly
  requested.
- Persist or restore selected workspace data through Templar-owned blob
  storage when a product requires it.
- Support cancellation, deterministic cleanup, structured logging, tracing,
  and usage or cost metadata.

## Safety Model

- Use a separate sandbox for each user or trust boundary. Sharing is an
  explicit product decision, never a default optimization.
- Contain file operations within a configured workspace root.
- Apply default limits for execution time, output size, storage, processes,
  and idle lifetime.
- Do not place long-lived provider or application credentials in the sandbox.
  Broker narrowly scoped external requests from trusted application code when
  credentials are required.
- Treat network access, public previews, destructive commands, and persisted
  artifacts as explicit capabilities that callers must enable.
- Ensure cleanup is idempotent and observable even after partial failures.

## Package Boundary

The public API should express Templar intents rather than container primitives.
It should be an Effect service with scoped lifecycle management, typed domain
errors, and a small primitive driver contract. Provider-specific bindings,
transport modes, container identifiers, and raw response shapes stay inside
the default driver.

Likely domain concepts include:

- sandbox identity and lifecycle
- isolated execution sessions
- command and process results
- workspace files and artifacts
- preview endpoints
- resource limits and expiration

A memory or fake implementation should make higher-level agent workflows
testable without starting real containers.

## Non-Goals

- General-purpose production container orchestration.
- Permanent application hosting.
- Browser or desktop automation; that belongs in `@templar/browser`.
- An unrestricted remote shell exposed directly to a language model.
- A generic wrapper around every capability exposed by the default provider.

## Open Decisions

- Whether the first release needs stateful sessions or only one-shot commands.
- Which network policies can be enforced consistently by the default provider.
- Whether preview URLs require a separate approval or authorization layer.
- Which persistence operations belong here versus `@templar/blob`.
- The minimum resource and cost metadata needed for agent budgets.
