# Hello World Web

TanStack Start integration app deployed to Cloudflare with Alchemy. Its authentication example
uses `createTemplarUserApp`: central Templar SSO establishes the app session and the successful
callback creates the canonical ID in this app's local `app_users` table.

Run `pnpm --filter templar-auth dev` alongside Hello World to test the local SSO flow.
