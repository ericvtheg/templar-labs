# Tools

Internal developer tools for building, validating, generating, deploying, or operating projects in this monorepo.

This directory is intentionally named `tools` instead of `scripts`. The goal is for useful automation to grow into reusable internal tooling rather than a pile of one-off commands.

## What Belongs Here

Use `tools/` for repo-specific developer workflows that may have their own command surface, tests, templates, docs, or internal modules.

Examples:

- project scaffolding
- workspace validation
- deploy orchestration
- release management
- content pipelines
- agent workflows
- log inspection
- migration helpers

## What Does Not Belong Here

Use `packages/` for reusable runtime libraries or shared configuration packages.

Use `projects/` for deployable apps/products.

Use `infra/` for infrastructure definitions and IaC entrypoints.

Use `docs/` for decisions, playbooks, and long-form documentation.

## Shape

A small tool can start as a single file, but if it grows command flags, multiple steps, reusable helpers, or tests, promote it into its own folder:

```txt
tools/
  project-scaffold/
  workspace-check/
  deploy/
```

Tools should prefer the shared monorepo conventions: TypeScript, strict tsconfig presets, Effect for meaningful workflows, and minimal click ops.
