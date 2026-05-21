# Projects

Projects are specific, well, projects that contain one or many deployables (aka apps).

Each project owns its source-of-truth database. Apps are interfaces and
background executors that should reuse the project backend/service layer and the
project database instead of creating isolated app databases by default.

Preferred layout:

```txt
projects/<project>/
  alchemy.run.ts
  templar-bindings.ts
  db/
    schema.ts
    migrations/
    db.config.mjs
    drizzle.config.ts
  apps/
    web/
    worker/
    bot/
```
