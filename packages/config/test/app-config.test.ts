import assert from "node:assert/strict";
import test from "node:test";
import { ConfigProvider, Effect } from "effect";
import { appConfigDescriptor } from "../src/app-config.ts";

test("reads the automatic Templar platform contract", async () => {
  const provider = ConfigProvider.fromMap(
    new Map([
      ["TEMPLAR_APP_ID", "your-shopper"],
      ["TEMPLAR_AUTH_ISSUER", "https://auth.breli.app"],
      ["TEMPLAR_ENVIRONMENT", "prod"],
    ]),
  );

  const config = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* appConfigDescriptor;
    }).pipe(Effect.withConfigProvider(provider)),
  );

  assert.deepEqual(config, {
    appId: "your-shopper",
    authIssuer: "https://auth.breli.app",
    environment: "prod",
  });
});

test("defaults the platform environment to local", async () => {
  const provider = ConfigProvider.fromMap(
    new Map([
      ["TEMPLAR_APP_ID", "your-shopper"],
      ["TEMPLAR_AUTH_ISSUER", "https://auth.breli.app"],
    ]),
  );

  const config = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* appConfigDescriptor;
    }).pipe(Effect.withConfigProvider(provider)),
  );

  assert.equal(config.environment, "local");
});
