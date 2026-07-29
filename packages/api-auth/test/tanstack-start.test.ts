import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import { type ApiAuthService, defineApiAuthManifest } from "../src/index.ts";
import { bearerKey, withApiKey } from "../src/tanstack-start.ts";

const manifest = defineApiAuthManifest({
  audience: "your-shopper:web",
  keyPrefix: "ys_live_",
  permissions: { hello: ["read"] },
});

const service: ApiAuthService<typeof manifest.permissions> = {
  manifest: {
    ...manifest,
    keys: {
      defaultExpiresInDays: 90,
      maximumExpiresInDays: 365,
      maximumActivePerUser: 10,
    },
  },
  createKey: () => Effect.die("unused"),
  listKeys: () => Effect.die("unused"),
  revokeKey: () => Effect.die("unused"),
  verifyKey: ({ key }) =>
    Effect.succeed(
      key === "valid"
        ? {
            authenticated: true,
            principal: {
              keyId: "key-1",
              audience: manifest.audience,
              userId: "user-1",
              permissions: { hello: ["read"] },
            },
          }
        : { authenticated: false, reason: "invalid-key" },
    ),
};

test("extracts strict bearer credentials", () => {
  assert.equal(bearerKey("Bearer valid"), "valid");
  assert.equal(bearerKey("bearer valid"), "valid");
  assert.equal(bearerKey("valid"), null);
  assert.equal(bearerKey("Bearer two words"), null);
});

test("protects TanStack server route handlers", async () => {
  const handler = withApiKey(
    {
      apiAuth: () => service,
      permissions: { hello: ["read"] },
    },
    ({ principal }) => Response.json({ userId: principal.userId }),
  );

  const missing = await handler({ request: new Request("https://example.com/api/hello") });
  assert.equal(missing.status, 401);

  const allowed = await handler({
    request: new Request("https://example.com/api/hello", {
      headers: { authorization: "Bearer valid" },
    }),
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { userId: "user-1" });
});
