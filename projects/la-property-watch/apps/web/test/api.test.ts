import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Bindings } from "../src/lib/auth.server.ts";
import { handleResearch } from "../src/lib/research.server.ts";
import { testDatabase } from "./support/d1.ts";

const origin = "https://la-property-watch.breli.app";
const secret = "la-property-watch-unit-test-secret-never-production";

async function sessionCookie(input: {
  email: string;
  verified?: boolean;
  admin?: boolean;
  expiresAt?: number;
}) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    createHash("sha256").update(secret).digest(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const now = Date.now();
  const payload = JSON.stringify({
    id: `session-${input.email}`,
    userId: `user-${input.email}`,
    name: "Researcher",
    email: input.email,
    emailVerified: input.verified ?? true,
    image: null,
    admin: input.admin ?? false,
    createdAt: now,
    expiresAt: input.expiresAt ?? now + 60_000,
  });
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(payload),
  );
  return `templar.auth.session=${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

describe("private research API", () => {
  let database: ReturnType<typeof testDatabase>;
  let sent: string[];
  let env: Bindings;
  beforeEach(() => {
    database = testDatabase();
    sent = [];
    env = {
      AUTH_SECRET: secret,
      TEMPLAR_AUTH_ISSUER: "https://auth.example.test",
      DB: database.binding,
      JOBS: {
        async send(body: string) {
          sent.push(body);
          return { metadata: { metrics: { backlogCount: 1, backlogBytes: body.length } } };
        },
        async sendBatch() {
          throw new Error("sendBatch is not used in this test");
        },
      } as unknown as Queue<string>,
    };
  });
  afterEach(() => database.close());

  it("rejects signed-out, forged, wrong-email, unverified, and admin accounts", async () => {
    const allowed = await sessionCookie({ email: "ericventor97@gmail.com" });
    const cases = [
      { cookie: "", expected: 401 },
      { cookie: `${allowed}forged`, expected: 401 },
      { cookie: await sessionCookie({ email: "other@example.com" }), expected: 403 },
      {
        cookie: await sessionCookie({ email: "ericventor97@gmail.com", verified: false }),
        expected: 403,
      },
      { cookie: await sessionCookie({ email: "admin@example.com", admin: true }), expected: 403 },
    ];
    for (const entry of cases) {
      const response = await handleResearch(
        new Request(`${origin}/api/research/data`, { headers: { cookie: entry.cookie } }),
        env,
      );
      assert.equal(response.status, entry.expected);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      assert.doesNotMatch(await response.text(), /foreclosure_records|ericventor97/);
    }
  });

  it("returns data and CSV only to the exact verified account", async () => {
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const data = await handleResearch(
      new Request(`${origin}/api/research/data`, { headers: { cookie } }),
      env,
    );
    assert.equal(data.status, 200);
    assert.deepEqual(((await data.json()) as { records: unknown[] }).records, []);
    const csv = await handleResearch(
      new Request(`${origin}/api/research/export.csv`, { headers: { cookie } }),
      env,
    );
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-disposition") ?? "", /attachment/);
    assert.match(await csv.text(), /^"sale_type"/);
    const deniedCsv = await handleResearch(new Request(`${origin}/api/research/export.csv`), env);
    assert.equal(deniedCsv.status, 401);
  });

  it("allows the second approved account only with verified email", async () => {
    for (const verified of [true, false]) {
      const cookie = await sessionCookie({ email: "Rhwcreative@gmail.com", verified });
      for (const path of ["data", "export.csv"]) {
        const response = await handleResearch(
          new Request(`${origin}/api/research/${path}`, { headers: { cookie } }),
          env,
        );
        assert.equal(response.status, verified ? 200 : 403);
      }
    }
  });

  it("requires same-origin bodyless writes and queues bounded background work", async () => {
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const crossOrigin = await handleResearch(
      new Request(`${origin}/api/research/refresh`, {
        method: "POST",
        headers: { cookie, origin: "https://evil.example" },
      }),
      env,
    );
    assert.equal(crossOrigin.status, 403);
    assert.equal(sent.length, 0);
    const withBody = await handleResearch(
      new Request(`${origin}/api/research/refresh`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: "{}",
      }),
      env,
    );
    assert.equal(withBody.status, 400);
    assert.equal(sent.length, 0);
    const accepted = await handleResearch(
      new Request(`${origin}/api/research/refresh`, {
        method: "POST",
        headers: { cookie, origin },
      }),
      env,
    );
    assert.equal(accepted.status, 202);
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0] ?? "", /ericventor97|unit-test-secret/);
    const body = (await accepted.json()) as { queued: boolean; job: { status: string } };
    assert.equal(body.queued, true);
    assert.equal(body.job.status, "queued");
    const duplicate = await handleResearch(
      new Request(`${origin}/api/research/refresh`, {
        method: "POST",
        headers: { cookie, origin },
      }),
      env,
    );
    assert.equal(duplicate.status, 200);
    assert.equal(sent.length, 1);
  });
});
