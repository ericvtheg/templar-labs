# Projects

Projects are specific, well, projects that contain one or many deployables (aka apps).

## App Scaffold Checklist

New deployable web apps should follow the existing TanStack Start + Alchemy shape:

```txt
projects/<name>/package.json
projects/<name>/alchemy.run.ts
projects/<name>/apps/web/package.json
projects/<name>/apps/web/tsconfig.json
projects/<name>/apps/web/vite.config.ts
projects/<name>/apps/web/components.json
projects/<name>/apps/web/src/*
```

Project app setup should include:

- A project-level `alchemy.run.ts` that composes shared deploy helpers from `@templar/deploy`.
- App package scripts that delegate `dev`, `deploy`, and `destroy` to the project root.
- A project-specific Vite `server.port` with `strictPort: true` so local apps do not silently collide.
- Shared UI imports through `@templar/ui` and the TanStack app tsconfig baseline.
- Generated TanStack route trees left unformatted and unlinted through the root tool config.
