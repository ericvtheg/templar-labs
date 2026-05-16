# UI Showcase Spin-Up Hiccups

## Direct Vite Start Failed

Running Vite directly for the new app failed:

```sh
pnpm --dir projects/ui-showcase/apps/web exec vite --host 127.0.0.1 --port 5174
```

The Alchemy Vite plugin expected a generated Wrangler config at:

```txt
projects/ui-showcase/apps/web/.alchemy/local/wrangler.jsonc
```

That file does not exist until the app has been started through Alchemy. The reliable path for a fresh Alchemy app is:

```sh
pnpm --filter ui-showcase dev
```

## Dev Port Was Not App-Specific

`alchemy dev` started the app on the default Vite port:

```txt
http://localhost:5173/
```

That can collide with another app already running locally. A per-app dev port convention would make parallel project work easier.

The convention is now to set a project-specific Vite dev server port with `strictPort: true` in each app's `vite.config.ts`.

## UI Source Imports Exposed Strict TypeScript Conflicts

Apps import `@templar/ui` source files directly. That means app typecheck also checks generated shadcn component source.

Some generated shadcn/Radix code conflicted with these strict options:

```json
"exactOptionalPropertyTypes": true,
"noPropertyAccessFromIndexSignature": true
```

The workaround was to relax those options for TanStack app consumers so apps can typecheck shared UI source consistently.

## Biome Needed Tailwind v4 Directive Parsing

The shared UI CSS uses Tailwind v4 directives:

```css
@custom-variant
@theme
@apply
```

Biome could not parse those until this config was enabled:

```json
"css": {
  "parser": {
    "tailwindDirectives": true
  }
}
```

## Generated shadcn Components Hit Repo Lint Rules

The shadcn registry code tripped repo-specific Biome and Oxlint rules, including:

- type-only React imports
- nested component definitions
- ARIA semantic preferences
- shadowed variable names
- underscore-prefixed local variables

Rather than rewriting generated registry code, `packages/ui/src/components/**` was treated like generated/vendor code for lint purposes while still being typechecked.

## Showcase Page Needed A11y Cleanup

The first showcase page used static IDs and wrapper labels around Radix controls. Biome caught this.

The fix was to use `useId()` and explicit `Label htmlFor` / control `id` pairs.

## Copied Env Example Was Unnecessary

`projects/ui-showcase/apps/web/.env.example` was initially copied from the existing app convention:

```txt
ALCHEMY_PASSWORD=change-me
```

The showcase app does not need that file, so it was removed.

## Follow-Up Idea

Create an internal scaffold command or template for new project apps that generates:

```txt
projects/<name>/package.json
projects/<name>/alchemy.run.ts
projects/<name>/apps/web/package.json
projects/<name>/apps/web/tsconfig.json
projects/<name>/apps/web/vite.config.ts
projects/<name>/apps/web/components.json
projects/<name>/apps/web/src/*
```

The scaffold should accept the project name and domain, then wire the Alchemy app name, domain, package names, scripts, UI imports, and dev conventions automatically.

Until a command exists, `projects/README.md` now carries the scaffold checklist and the expected local dev-port convention.
