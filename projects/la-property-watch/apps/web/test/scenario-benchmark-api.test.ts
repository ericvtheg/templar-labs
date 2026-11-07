import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Bindings } from "../src/lib/auth.server.ts";
import { handleResearch } from "../src/lib/research.server.ts";
import { testDatabase } from "./support/d1.ts";

const origin = "https://la-property-watch.breli.app";
const secret = "scenario-benchmark-api-test-secret";
const propertyKey = "norfolk-va:15834200";

async function cookie(email: string) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    createHash("sha256").update(secret).digest(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const now = Date.now();
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        id: crypto.randomUUID(),
        userId: `user-${email}`,
        name: "Partner",
        email,
        emailVerified: true,
        image: null,
        admin: false,
        createdAt: now,
        expiresAt: now + 60_000,
      }),
    ),
  );
  return `templar.auth.session=${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

function request(path: string, session: string, body?: unknown, requestOrigin = origin) {
  return new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? { cookie: session }
        : { cookie: session, origin: requestOrigin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("protected C/E API", () => {
  let database: ReturnType<typeof testDatabase>;
  let env: Bindings;
  beforeEach(() => {
    database = testDatabase();
    env = {
      AUTH_SECRET: secret,
      TEMPLAR_AUTH_ISSUER: "https://auth.example.test",
      DB: database.binding,
    } as Bindings;
    database.sqlite.exec(`
      INSERT INTO watchlist_properties
      (property_key,jurisdiction_id,jurisdiction_name,parcel_id,address,city,state,zip,score,signal_types,independent_signal_count,evidence_count,tax_installment_count,code_violation_count,recorded_lien_count,total_delinquent_cents,first_seen_at,last_seen_at,source_names,ranked_at)
      VALUES ('${propertyKey}','norfolk-va','Norfolk, VA','15834200','2800 VIMY RIDGE AV','Norfolk','VA','23509',65,'["tax_delinquency"]',1,1,1,0,0,100000,'2026-11-01T00:00:00.000Z','2026-11-07T00:00:00.000Z','["Norfolk"]','2026-11-07T00:00:00.000Z');
      INSERT INTO buy_boxes
      (id,name,property_types_json,jurisdictions_json,neighborhoods_json,zips_json,size_basis,value_basis,distress_phases_json,version,created_at,created_by,updated_at,updated_by)
      VALUES ('api-buybox','API buy box','[]','["norfolk-va"]','[]','[]','none','assessed_value','[]',2,'2026-11-07T00:00:00.000Z','ericventor97@gmail.com','2026-11-07T00:00:00.000Z','ericventor97@gmail.com');
    `);
  });
  afterEach(() => database.close());

  it("protects every C/E read/write/export and enforces same-origin", async () => {
    for (const path of [
      `/api/research/scenarios/${encodeURIComponent(propertyKey)}`,
      "/api/research/benchmarks",
      "/api/research/benchmarks/missing/export.csv",
    ]) {
      assert.equal((await handleResearch(new Request(`${origin}${path}`), env)).status, 401);
    }
    const session = await cookie("ericventor97@gmail.com");
    const response = await handleResearch(
      request(
        `/api/research/scenarios/${encodeURIComponent(propertyKey)}`,
        session,
        {
          id: null,
          expectedVersion: 0,
          name: "Cross origin",
          kind: "flip",
          financing: null,
          inputs: {},
          sensitivity: [],
          candidateSelections: [],
        },
        "https://evil.example",
      ),
      env,
    );
    assert.equal(response.status, 403);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM property_deal_scenarios").get()?.["n"],
      0,
    );
  });

  it("creates and reloads incomplete scenarios without inventing zeros or client provenance", async () => {
    const session = await cookie("ericventor97@gmail.com");
    const url = `/api/research/scenarios/${encodeURIComponent(propertyKey)}`;
    const created = await handleResearch(
      request(url, session, {
        id: null,
        expectedVersion: 0,
        name: "API incomplete flip",
        kind: "flip",
        financing: null,
        inputs: { purchasePrice: null, rehab: { value: 0, asOf: "2026-11-07" } },
        sensitivity: [],
        candidateSelections: [],
      }),
      env,
    );
    assert.equal(created.status, 201);
    const body = (await created.json()) as {
      inputs: Record<string, { valueCents: number | null }>;
      result: { evaluation: { status: string; issues: Array<{ path: string }> } };
    };
    assert.equal(body.inputs["purchasePrice"]?.valueCents, null);
    assert.equal(body.inputs["rehab"]?.valueCents, 0);
    assert.equal(body.result.evaluation.status, "missing");
    assert.ok(body.result.evaluation.issues.some((issue) => issue.path.includes("purchasePrice")));
    const loaded = await handleResearch(request(url, session), env);
    assert.equal(loaded.status, 200);
    assert.equal(((await loaded.json()) as { scenarios: unknown[] }).scenarios.length, 1);
    const forged = await handleResearch(
      request(url, session, {
        id: null,
        expectedVersion: 0,
        name: "Forged",
        kind: "flip",
        financing: null,
        inputs: {
          salePrice: {
            value: 100,
            asOf: "2026-11-07",
            provenance: { kind: "record", reference: "assessment" },
          },
        },
        sensitivity: [],
        candidateSelections: [],
      }),
      env,
    );
    assert.equal(forged.status, 400);
  });

  it("runs import, blind partner review, reload, reveal and safe export with no pre-reveal leakage", async () => {
    const creator = await cookie("ericventor97@gmail.com");
    const reviewer = await cookie("Rhwcreative@gmail.com");
    const create = await handleResearch(
      request("/api/research/benchmarks", creator, {
        privateName: "=SECRET comparison",
        market: "norfolk-va",
        asOfDate: "2026-11-07",
        buyBoxId: "api-buybox",
        propertyKeys: [propertyKey],
        competitorCsv: "parcel,score\n15834200,99\n,7\n123,4\n",
        tokenHeader: "parcel",
        competitorLabel: "=SECRET licensed source",
        fileName: "secret-source.csv",
        mode: "test-only",
        licenseAcknowledged: true,
      }),
      env,
    );
    assert.equal(create.status, 201);
    const preRevealText = await create.text();
    for (const secretValue of [
      "SECRET",
      "secret-source.csv",
      "internal-selected",
      "licensed-export",
      "datasetCounts",
    ]) {
      assert.equal(preRevealText.includes(secretValue), false, secretValue);
    }
    const benchmark = JSON.parse(preRevealText) as {
      id: string;
      cards: Array<{ cardId: string }>;
      version: number;
    };
    const partnerLoad = await handleResearch(
      request(`/api/research/benchmarks/${benchmark.id}`, reviewer),
      env,
    );
    const partnerBody = (await partnerLoad.json()) as {
      canReview: boolean;
      cards: Array<{ cardId: string }>;
    };
    assert.equal(partnerBody.canReview, true);
    assert.deepEqual(partnerBody.cards, benchmark.cards);
    for (const card of benchmark.cards) {
      const reviewed = await handleResearch(
        request(`/api/research/benchmarks/${benchmark.id}/reviews`, reviewer, {
          cardId: card.cardId,
          expectedVersion: 0,
          useful: "unknown",
          correctness: "unknown",
          researchSeconds: null,
          reason: "API review remains unknown",
        }),
        env,
      );
      assert.equal(reviewed.status, 200);
    }
    const beforeRevealExport = await handleResearch(
      request(`/api/research/benchmarks/${benchmark.id}/export.csv`, creator),
      env,
    );
    assert.equal(beforeRevealExport.status, 400);
    const revealed = await handleResearch(
      request(`/api/research/benchmarks/${benchmark.id}/reveal`, creator, {
        expectedVersion: benchmark.version,
        confirmation: "REVEAL SOURCES",
      }),
      env,
    );
    assert.equal(revealed.status, 200);
    const revealedText = await revealed.text();
    assert.match(revealedText, /SECRET licensed source/);
    assert.match(revealedText, /datasetCounts/);
    const exported = await handleResearch(
      request(`/api/research/benchmarks/${benchmark.id}/export.csv`, creator),
      env,
    );
    assert.equal(exported.status, 200);
    assert.match(await exported.text(), /"'=SECRET licensed source"/);
    assert.equal(
      database.sqlite
        .prepare("SELECT COUNT(*) n FROM property_feedback WHERE data_source='held_out_benchmark'")
        .get()?.["n"],
      0,
    );
  });

  it("rejects malformed and oversized benchmark requests before writes", async () => {
    const session = await cookie("ericventor97@gmail.com");
    const malformed = await handleResearch(
      request("/api/research/benchmarks", session, { privateName: "missing fields", extra: true }),
      env,
    );
    assert.equal(malformed.status, 400);
    const unlicensed = await handleResearch(
      request("/api/research/benchmarks", session, {
        privateName: "Unacknowledged",
        market: "norfolk-va",
        asOfDate: "2026-11-07",
        buyBoxId: "api-buybox",
        propertyKeys: [propertyKey],
        competitorCsv: "parcel\n15834200\n",
        tokenHeader: "parcel",
        competitorLabel: "Unacknowledged source",
        fileName: "source.csv",
        mode: "live",
        licenseAcknowledged: false,
      }),
      env,
    );
    assert.equal(unlicensed.status, 400);
    const oversized = await handleResearch(
      request("/api/research/benchmarks", session, {
        privateName: "Oversized",
        market: "norfolk-va",
        asOfDate: "2026-11-07",
        buyBoxId: "api-buybox",
        propertyKeys: [propertyKey],
        competitorCsv: `parcel\n${"1".repeat(61_000)}`,
        tokenHeader: "parcel",
        competitorLabel: "Licensed",
        fileName: "licensed.csv",
        mode: "live",
        licenseAcknowledged: true,
      }),
      env,
    );
    assert.equal(oversized.status, 400);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) n FROM blind_benchmarks").get()?.["n"],
      0,
    );
  });
});
