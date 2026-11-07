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
    assert.match(await csv.text(), /^"rank_score","rank_reasons","property_key"/);
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

  it("persists external-runner requests without sending CPU-heavy work to a Worker", async () => {
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const response = await handleResearch(
      new Request(`${origin}/api/research/refresh`, {
        method: "POST",
        headers: { cookie, origin },
      }),
      { ...env, INGESTION_RUNNER: "external" } as Bindings,
    );
    assert.equal(response.status, 202);
    assert.equal(sent.length, 0);
    const payload = (await response.json()) as { job: { status: string } };
    assert.equal(payload.job.status, "queued");
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

  it("returns private 400 responses for invalid pagination, filters, and D1-sized search patterns", async () => {
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const paths = [
      "/api/research/data?page=abc",
      "/api/research/data?page=Infinity",
      "/api/research/data?page=10001",
      "/api/research/data?pageSize=9",
      "/api/research/data?pageSize=101",
      "/api/research/data?signal=made_up",
      "/api/research/data?jurisdiction=Norfolk",
      "/api/research/data?qualification=invented",
      "/api/research/data?sort=propensity",
      `/api/research/data?query=${encodeURIComponent("a".repeat(49))}`,
      `/api/research/data?query=${encodeURIComponent("🙂".repeat(13))}`,
      "/api/research/properties/missing?evidencePage=abc",
      "/api/research/properties/missing?evidencePageSize=501",
    ];
    for (const path of paths) {
      const response = await handleResearch(
        new Request(`${origin}${path}`, { headers: { cookie } }),
        env,
      );
      assert.equal(response.status, 400, path);
      assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
      assert.doesNotMatch(await response.text(), /datatype mismatch|foreclosure_records|SELECT /i);
    }

    const boundary = await handleResearch(
      new Request(`${origin}/api/research/data?query=${"a".repeat(48)}`, { headers: { cookie } }),
      env,
    );
    assert.equal(boundary.status, 200);
    const sqlLooking = await handleResearch(
      new Request(`${origin}/api/research/data?query=${encodeURIComponent('" OR 1=1 --')}`, {
        headers: { cookie },
      }),
      env,
    );
    assert.equal(sqlLooking.status, 200);
    assert.equal(((await sqlLooking.json()) as { page: { total: number } }).page.total, 0);
  });

  it("protects and validates partner mutations, preserves notes, and rejects stale versions", async () => {
    database.sqlite.exec(`
      INSERT INTO foreclosure_records (
        id,sale_type,signal_type,jurisdiction_id,jurisdiction_name,source_record_id,source_key,
        source_id,source_name,source_url,observed_at,status,property_key,address,apn,raw_excerpt,
        first_seen_at,last_seen_at,updated_at
      ) VALUES (
        'api-evidence','tax_default','tax_delinquency','norfolk-va','Norfolk, VA','api-1','api-1',
        'api-source','Official test-shaped fixture','https://example.test/source',
        '2026-11-07T12:00:00.000Z','signal_status_unverified','norfolk-va:15834200',
        '=FORMULA ADDRESS','15834200','test-only fixture','2026-11-07T12:00:00.000Z',
        '2026-11-07T12:00:00.000Z','2026-11-07T12:00:00.000Z'
      );
    `);
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const partnerCookie = await sessionCookie({ email: "Rhwcreative@gmail.com" });
    const url = `${origin}/api/research/pipeline/${encodeURIComponent("norfolk-va:15834200")}`;
    const crossOrigin = await handleResearch(
      new Request(url, {
        method: "POST",
        headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 0, patch: { saved: true } }),
      }),
      env,
    );
    assert.equal(crossOrigin.status, 403);
    const malformed = await handleResearch(
      new Request(url, { method: "POST", headers: { cookie, origin }, body: "not json" }),
      env,
    );
    assert.equal(malformed.status, 400);
    const accepted = await handleResearch(
      new Request(url, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          patch: {
            saved: true,
            stage: "Researching",
            assignedTo: "Rhwcreative@gmail.com",
          },
        }),
      }),
      env,
    );
    assert.equal(accepted.status, 200);
    assert.equal(((await accepted.json()) as { version: number }).version, 1);
    const conflict = await handleResearch(
      new Request(url, {
        method: "POST",
        headers: { cookie: partnerCookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 0, patch: { stage: "Qualified" } }),
      }),
      env,
    );
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { code: string }).code, "version_conflict");

    for (const { noteCookie, body } of [
      { noteCookie: cookie, body: "First attributed note" },
      { noteCookie: partnerCookie, body: "Second attributed note" },
    ]) {
      const response = await handleResearch(
        new Request(`${origin}/api/research/notes/${encodeURIComponent("norfolk-va:15834200")}`, {
          method: "POST",
          headers: { cookie: noteCookie, origin, "content-type": "application/json" },
          body: JSON.stringify({ body }),
        }),
        env,
      );
      assert.equal(response.status, 201);
    }
    const brief = await handleResearch(
      new Request(
        `${origin}/api/research/deal-briefs/${encodeURIComponent("norfolk-va:15834200")}`,
        {
          headers: { cookie },
        },
      ),
      env,
    );
    assert.equal(brief.status, 200);
    assert.equal(((await brief.json()) as { notes: unknown[] }).notes.length, 2);

    const assessment = await handleResearch(
      new Request(
        `${origin}/api/research/assessments/${encodeURIComponent("norfolk-va:15834200")}`,
        {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: "{}",
        },
      ),
      env,
    );
    assert.equal(assessment.status, 201);
    assert.ok(((await assessment.json()) as { assertions: unknown[] }).assertions.length > 0);
    const override = await handleResearch(
      new Request(
        `${origin}/api/research/qualification-overrides/${encodeURIComponent("norfolk-va:15834200")}`,
        {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: 0,
            action: "deprioritize",
            reason: "API attributed bad-lead review",
          }),
        },
      ),
      env,
    );
    assert.equal(override.status, 200);
    const feedback = await handleResearch(
      new Request(`${origin}/api/research/feedback/${encodeURIComponent("norfolk-va:15834200")}`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          usefulness: "useful",
          verification: "unresolved",
          interest: "investigate",
          outcome: "none",
          researchMinutes: 12,
          reason: "API real review label",
        }),
      }),
      env,
    );
    assert.equal(feedback.status, 200);

    const exportResponse = await handleResearch(
      new Request(`${origin}/api/research/export-selected.csv`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ propertyKeys: ["norfolk-va:15834200"] }),
      }),
      env,
    );
    assert.equal(exportResponse.status, 200);
    const csv = await exportResponse.text();
    assert.match(csv, /norfolk-va:15834200/);
    assert.doesNotMatch(csv, /,"[=+\-@]/);
  });

  it("keeps every partner read and export private", async () => {
    for (const [path, method] of [
      ["/api/research/workspace", "GET"],
      ["/api/research/deal-briefs/norfolk-va%3A15834200", "GET"],
      ["/api/research/export-selected.csv", "POST"],
      ["/api/research/buy-boxes", "POST"],
      ["/api/research/assessments/norfolk-va%3A15834200", "POST"],
      ["/api/research/rechecks/norfolk-va%3A15834200", "POST"],
      ["/api/research/qualification-overrides/norfolk-va%3A15834200", "POST"],
      ["/api/research/feedback/norfolk-va%3A15834200", "POST"],
      ["/api/research/ranking-profile", "POST"],
    ] as const) {
      const response = await handleResearch(
        new Request(`${origin}${path}`, {
          method,
          ...(method === "POST"
            ? {
                headers: { origin, "content-type": "application/json" },
                body: JSON.stringify({ propertyKeys: ["norfolk-va:15834200"] }),
              }
            : {}),
        }),
        env,
      );
      assert.equal(response.status, 401, path);
    }
  });

  it("returns 400 with zero writes for missing, null, scalar, wrong-array, extra, and unknown-only mutation fields", async () => {
    database.sqlite.exec(`
      INSERT INTO foreclosure_records (
        id,sale_type,signal_type,jurisdiction_id,jurisdiction_name,source_record_id,source_key,
        source_id,source_name,source_url,observed_at,status,property_key,apn,raw_excerpt,
        first_seen_at,last_seen_at,updated_at
      ) VALUES (
        'validation-evidence','tax_default','tax_delinquency','norfolk-va','Norfolk, VA','validation-1','validation-1',
        'validation-source','Official fixture','https://example.test/source','2026-11-07T12:00:00.000Z',
        'signal_status_unverified','norfolk-va:15834200','15834200','test-only fixture',
        '2026-11-07T12:00:00.000Z','2026-11-07T12:00:00.000Z','2026-11-07T12:00:00.000Z'
      );
    `);
    const cookie = await sessionCookie({ email: "ericventor97@gmail.com" });
    const property = encodeURIComponent("norfolk-va:15834200");
    const cases: Array<[string, unknown]> = [
      [`/api/research/pipeline/${property}`, {}],
      [`/api/research/pipeline/${property}`, { expectedVersion: 0, patch: null }],
      [`/api/research/pipeline/${property}`, { expectedVersion: 0, patch: { foo: 1 } }],
      [
        `/api/research/pipeline/${property}`,
        { expectedVersion: 0, patch: { saved: true }, extra: true },
      ],
      [`/api/research/notes/${property}`, {}],
      [`/api/research/notes/${property}`, { body: null }],
      [`/api/research/notes/${property}`, { body: "note", extra: true }],
      [
        `/api/research/value-assumptions/${property}`,
        { label: "x", valueCents: "100", asOfDate: "2026-11-01" },
      ],
      [
        `/api/research/value-assumptions/${property}`,
        { label: null, valueCents: 100, asOfDate: "2026-11-01" },
      ],
      [
        `/api/research/value-assumptions/${property}`,
        { label: "x", valueCents: 100, asOfDate: "2026-11-01", extra: 1 },
      ],
      ["/api/research/buy-boxes", { id: null }],
      [
        "/api/research/buy-boxes",
        {
          id: null,
          expectedVersion: 0,
          name: "x",
          propertyTypes: "sfh",
          jurisdictions: [],
          neighborhoods: [],
          zips: [],
          sizeBasis: "none",
          minSizeValue: null,
          maxSizeValue: null,
          minValueCents: null,
          maxValueCents: null,
          valueBasis: "assessed_value",
          valueAssumptionLabel: null,
          distressPhases: [],
        },
      ],
      ["/api/research/alert-preferences", { newActivity: true, worseningActivity: true }],
      [
        "/api/research/alert-preferences",
        { newActivity: true, worseningActivity: null, dueFollowUps: true },
      ],
      [
        "/api/research/alert-preferences",
        { newActivity: true, worseningActivity: true, dueFollowUps: true, extra: true },
      ],
      ["/api/research/alerts/read", { ids: null }],
      ["/api/research/alerts/read", { ids: [1] }],
      ["/api/research/alerts/read", { ids: [], extra: true }],
      ["/api/research/export-selected.csv", { propertyKeys: null }],
      ["/api/research/export-selected.csv", { propertyKeys: [1] }],
      ["/api/research/export-selected.csv", { propertyKeys: [], extra: true }],
      [`/api/research/assessments/${property}`, { extra: true }],
      [`/api/research/rechecks/${property}`, { extra: true }],
      [
        `/api/research/qualification-overrides/${property}`,
        { expectedVersion: 0, action: "invented", reason: "invalid action" },
      ],
      [
        `/api/research/feedback/${property}`,
        {
          expectedVersion: 0,
          usefulness: "synthetic",
          verification: "unknown",
          interest: "unknown",
          outcome: "unknown",
          researchMinutes: null,
          reason: "invalid label",
        },
      ],
      [
        "/api/research/ranking-profile",
        {
          expectedVersion: 0,
          enabled: true,
          minimumSamples: 1,
          maximumAdjustment: 100,
          reason: "unsafe threshold",
        },
      ],
    ];
    const writeCount = () =>
      Number(
        database.sqlite
          .prepare(`SELECT
      (SELECT COUNT(*) FROM partner_properties)+(SELECT COUNT(*) FROM property_notes)+
      (SELECT COUNT(*) FROM property_value_assumptions)+(SELECT COUNT(*) FROM buy_boxes)+
      (SELECT COUNT(*) FROM user_alert_preferences)+(SELECT COUNT(*) FROM property_alerts)+
      (SELECT COUNT(*) FROM property_assessments)+(SELECT COUNT(*) FROM property_rechecks)+
      (SELECT COUNT(*) FROM property_qualification_overrides)+
      (SELECT COUNT(*) FROM property_qualification_override_audit)+
      (SELECT COUNT(*) FROM property_feedback)+(SELECT COUNT(*) FROM property_feedback_audit)+
      (SELECT COUNT(*) FROM ranking_adjustment_profile)+(SELECT COUNT(*) FROM ranking_adjustment_audit) total`)
          .get()?.["total"] ?? 0,
      );
    for (const [path, body] of cases) {
      const before = writeCount();
      const response = await handleResearch(
        new Request(`${origin}${path}`, {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        env,
      );
      assert.equal(response.status, 400, `${path}: ${JSON.stringify(body)}`);
      assert.equal(writeCount(), before, `${path} wrote state for ${JSON.stringify(body)}`);
    }
  });
});
