import assert from "node:assert/strict";
import test from "node:test";
import type { AppEnvironment } from "@templar/config";
import type {
  D1Database as D1DatabaseBinding,
  KVNamespace as KVNamespaceBinding,
  Queue as QueueBinding,
  R2Bucket as R2BucketBinding,
} from "alchemy/cloudflare";
import { templarApp } from "../src/cloudflare/resources/templar-app.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Assert<Value extends true> = Value;

function baseApp() {
  return templarApp("website", {
    cwd: "apps/web",
  });
}

function authApp() {
  return templarApp("website", {
    cwd: "apps/web",
    services: {
      auth: true,
    },
  });
}

function servicesApp() {
  return templarApp("website", {
    cwd: "apps/web",
    services: {
      ai: true,
      auth: true,
    },
  });
}

function databaseApp(db: D1DatabaseBinding) {
  return templarApp("website", {
    cwd: "apps/web",
    db,
  });
}

function resourcesApp(
  blob: R2BucketBinding,
  cache: KVNamespaceBinding,
  queue: QueueBinding<string>,
) {
  return templarApp("website", {
    cwd: "apps/web",
    blob,
    cache,
    queue,
  });
}

type BaseEnv = Awaited<ReturnType<typeof baseApp>>["Env"];
type AuthEnv = Awaited<ReturnType<typeof authApp>>["Env"];
type ServicesEnv = Awaited<ReturnType<typeof servicesApp>>["Env"];
type DatabaseEnv = Awaited<ReturnType<typeof databaseApp>>["Env"];
type ResourcesEnv = Awaited<ReturnType<typeof resourcesApp>>["Env"];

export type TemplarAppTypeAssertions = [
  Assert<Equal<BaseEnv["TEMPLAR_APP_ID"], string>>,
  Assert<Equal<BaseEnv["TEMPLAR_AUTH_ISSUER"], string>>,
  Assert<Equal<BaseEnv["TEMPLAR_ENVIRONMENT"], AppEnvironment>>,
  Assert<Equal<"AUTH_SECRET" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<"OPENROUTER_API_TOKEN" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<"DB" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<"R2" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<"CACHE" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<"JOBS" extends keyof BaseEnv ? true : false, false>>,
  Assert<Equal<AuthEnv["AUTH_SECRET"], string>>,
  Assert<Equal<"OPENROUTER_API_TOKEN" extends keyof AuthEnv ? true : false, false>>,
  Assert<Equal<ServicesEnv["AUTH_SECRET"], string>>,
  Assert<Equal<ServicesEnv["OPENROUTER_API_TOKEN"], string>>,
  Assert<Equal<DatabaseEnv["DB"], D1Database>>,
  Assert<Equal<ResourcesEnv["R2"], R2Bucket>>,
  Assert<Equal<ResourcesEnv["CACHE"], KVNamespace>>,
  Assert<Equal<ResourcesEnv["JOBS"], Queue<string>>>,
];

test("templarApp binding inference compiles", () => {
  assert.ok(true);
});
