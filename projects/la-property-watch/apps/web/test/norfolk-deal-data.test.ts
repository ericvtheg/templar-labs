import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fetchNorfolkDealData, persistNorfolkDealData } from "../src/lib/norfolk-deal-data.ts";
import { testDatabase } from "./support/d1.ts";

const metadata = {
  id: "qva7-tzrf",
  rowsUpdatedAt: 1_794_053_270,
  viewLastModified: 1_794_054_056,
};

const target = {
  lrsn: "44509",
  parcel_id: "32464650",
  extension: "C01",
  gpin: "1448465112",
  legal_description: "Sites 1,3, 490.16ft & 25ft Strip",
  owner: "Jne Holdings Llc Et Als",
  property_street_number: "2805",
  property_street_name: "Early",
  property_street_type: "ST",
  property_city: "Norfolk",
  property_zip: "23513-3834",
  acreage: "7.0136",
  land_square_footage: "305513",
  property_class_description: "405 Apartment 49+ Low Rise",
  property_use: "Apartment",
  current_improvement_value: "15503400",
  current_land_value: "1985800",
  current_total_value: "17489200",
  effective_year: "2026-07-01T00:00:00.000",
  transfer_date: "2025-03-21T00:00:00.000",
  grantor: "Nusbaum, Robert C Tr",
  grantee: "Jne Holdings Llc Et Als",
  consideration: "18165000",
  document_number: "250004820",
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Norfolk official deal data", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
  });
  afterEach(() => database.close());

  it("joins only an exact literal PIN and never sums parcel values across extensions", async () => {
    const candidateRows = [
      {
        ...target,
        parcel_id: "30989800",
        extension: "C01",
        property_street_number: "5385",
        property_street_direction: "E",
        property_street_name: "Princess Anne",
        property_street_type: "RD",
        transfer_date: "2026-05-01T00:00:00.000",
        consideration: "10000000",
        document_number: "260008345",
        commercial_building_area: "45864",
      },
      {
        ...target,
        parcel_id: "30989800",
        extension: "C02",
        property_street_number: "5385",
        property_street_direction: "E",
        property_street_name: "Princess Anne",
        property_street_type: "RD",
        transfer_date: "2026-05-01T00:00:00.000",
        consideration: "10000000",
        document_number: "260008345",
        commercial_building_area: "45320",
      },
    ];
    const requests: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      requests.push(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([target]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("document_number in")) {
        return json(candidateRows);
      }
      if (parsed.searchParams.get("$where")?.startsWith("parcel_id in")) {
        return json(candidateRows);
      }
      if (parsed.searchParams.get("$select")?.startsWith("parcel_id")) {
        return json(candidateRows);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const data = await fetchNorfolkDealData(
      fetchImpl as typeof fetch,
      "32464650",
      new Date("2026-11-07T17:30:00Z"),
    );
    assert.equal(data.enrichment.propertyKey, "norfolk-va:32464650");
    assert.equal(data.enrichment.normalizedPropertyType, "commercial");
    assert.equal(data.enrichment.assessedTotalCents, 1_748_920_000);
    assert.equal(data.enrichment.commercialBuildingAreaValue, null);
    assert.equal(data.enrichment.buildingAreaUnitStatus, "unverified");
    assert.equal(data.enrichment.lotAreaSqft, 305_513);
    assert.equal(data.sales.length, 1, "extension rows represent one transfer candidate");
    assert.equal(data.sales[0]?.salePriceCents, 1_000_000_000);
    assert.equal(data.sales[0]?.buildingAreaSourceValue, 91_184);
    assert.equal(data.sales[0]?.buildingAreaUnitStatus, "unverified");
    assert.ok(requests.every((url) => !url.includes("air.norfolk.gov")));
    await persistNorfolkDealData(database.binding, data);
    assert.equal(
      database.sqlite.prepare("SELECT assessed_total_cents v FROM property_enrichment").get()?.[
        "v"
      ],
      1_748_920_000,
    );
    assert.equal(database.sqlite.prepare("SELECT count(*) n FROM property_sales").get()?.["n"], 1);
  });

  it("rejects numeric-source keys that lost leading zeros instead of padding them", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "00011605") {
        return json([{ ...target, parcel_id: "11605", lrsn: "8" }]);
      }
      return json([]);
    };
    await assert.rejects(
      fetchNorfolkDealData(fetchImpl as typeof fetch, "00011605"),
      /exact eight-digit|literal/i,
    );
  });

  it("retains legitimate pre-2000 subject transfer history", async () => {
    const historicalTarget = {
      ...target,
      transfer_date: "1997-08-14T00:00:00.000",
      consideration: "245000",
      document_number: "970123456",
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([historicalTarget]);
      }
      if (parsed.searchParams.has("$select")) {
        return json([]);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
    assert.equal(data.enrichment.lastTransferDate, "1997-08-14");
    assert.equal(data.enrichment.lastTransferConsiderationCents, 24_500_000);
  });

  it("keeps the subject transfer only in own history, never among comparison candidates", async () => {
    const comparison = {
      ...target,
      parcel_id: "30989800",
      transfer_date: "2026-05-01T00:00:00.000",
      consideration: "10000000",
      document_number: "260008345",
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([target]);
      }
      if (parsed.searchParams.get("$select")?.startsWith("parcel_id")) {
        return json([
          {
            parcel_id: target.parcel_id,
            document_number: target.document_number,
            transfer_date: target.transfer_date,
          },
          comparison,
        ]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("parcel_id in")) {
        return json([target, comparison]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("document_number in")) {
        return json([target, comparison]);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
    assert.deepEqual(
      data.sales.map((sale) => sale.candidateParcelId),
      ["30989800"],
    );
    assert.equal(data.enrichment.lastTransferDocumentNumber, target.document_number);
  });

  it("retains non-eight-digit raw candidate identifiers as explicitly unresolved", async () => {
    const unresolved = {
      ...target,
      parcel_id: "2812690",
      transfer_date: "2026-02-26T00:00:00.000",
      consideration: "8650000",
      document_number: "260003641",
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([target]);
      }
      if (parsed.searchParams.get("$select")?.startsWith("parcel_id")) {
        return json([unresolved]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("parcel_id in")) {
        assert.match(parsed.searchParams.get("$where") ?? "", /'2812690'/);
        assert.doesNotMatch(parsed.searchParams.get("$where") ?? "", /'02812690'/);
        return json([unresolved]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("document_number in")) {
        return json([unresolved]);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
    assert.equal(data.sales[0]?.candidateParcelId, "2812690");
    assert.equal(data.sales[0]?.candidatePropertyKey, null);
    assert.equal(data.sales[0]?.identityStatus, "unresolved_raw_identifier");
    assert.equal(data.sales[0]?.qualificationStatus, "unresolved_identity");
    assert.match(data.sales[0]?.exclusionReason ?? "", /not an eight-digit literal PIN/i);
  });

  it("flags multi-parcel or zero-consideration companion documents as unqualified", async () => {
    const candidate = {
      ...target,
      parcel_id: "37627005",
      property_street_number: "7715",
      property_street_name: "Harrisons",
      property_street_type: "RD",
      transfer_date: "2026-02-26T00:00:00.000",
      consideration: "8650000",
      document_number: "260003641",
      commercial_building_area: "84024",
    };
    const companion = {
      ...candidate,
      parcel_id: "2812690",
      extension: undefined,
      property_class_description: "400 Commercial Vacant Land",
      property_use: "Vacant Land",
      consideration: "0",
      commercial_building_area: undefined,
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([target]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("document_number in")) {
        return json([candidate, companion]);
      }
      if (parsed.searchParams.get("$where")?.startsWith("parcel_id in")) {
        return json([candidate]);
      }
      if (parsed.searchParams.get("$select")?.startsWith("parcel_id")) {
        return json([candidate]);
      }
      return json([]);
    };
    const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
    assert.equal(data.sales[0]?.documentParcelCount, 2);
    assert.equal(data.sales[0]?.qualificationStatus, "requires_package_review");
    assert.match(data.sales[0]?.exclusionReason ?? "", /multiple parcels|zero-consideration/i);
  });

  it("maps the complete published residential and vacant-land categories without treating condo units as whole multifamily parcels", async () => {
    const cases = [
      ["510 S/F Detached", "Single Family - Detached", "sfh"],
      ["511 S/F Attached (Townhome)", "Single Family - Attached", "sfh"],
      ["518 S/F w Add'l Dwelling Unit", "Single Family - Detached", "sfh"],
      ["520 Res Duplex Designed", "Duplex", "small_multifamily"],
      ["531 Res Triplex Converted", "Triplex", "small_multifamily"],
      ["540 Res Fourplex Designed", "Fourplex", "small_multifamily"],
      ["500 Residential Vacant lot", "Vacant Land", "land"],
      ["405 Apartment 49+ Low Rise", "Apartment", "commercial"],
      ["550 Res 2-4 Condo Designed", "Condominium", null],
    ] as const;
    for (const [propertyClass, propertyUse, expected] of cases) {
      const fetchImpl = async (input: string | URL | Request) => {
        const url = String(input);
        const parsed = new URL(url);
        if (url.includes("/api/views/")) {
          return json(metadata);
        }
        if (parsed.searchParams.get("parcel_id") === "32464650") {
          return json([
            { ...target, property_class_description: propertyClass, property_use: propertyUse },
          ]);
        }
        if (parsed.searchParams.has("$select")) {
          return json([]);
        }
        throw new Error(`Unexpected URL ${url}`);
      };
      const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
      assert.equal(data.enrichment.normalizedPropertyType, expected, propertyClass);
      if (expected) {
        assert.match(data.enrichment.typeMappingSourceUrl ?? "", /property_class_description/);
      }
    }
  });

  it("bounds common-class selection but completely fetches the selected extensions and document companions", async () => {
    const sfhTarget = {
      ...target,
      property_class_description: "510 S/F Detached",
      property_use: "Single Family - Detached",
    };
    const selected = Array.from({ length: 25 }, (_, index) => ({
      parcel_id: String(10_000_000 + index),
      document_number: String(26_000_000 + index),
      transfer_date: "2026-05-01T00:00:00.000",
    }));
    const details = selected.flatMap((row) =>
      Array.from({ length: 5 }, (_, extension) => ({
        ...sfhTarget,
        ...row,
        extension: `R0${extension + 1}`,
        consideration: "350000",
        residential_finished_living: "1200",
      })),
    );
    const requests: URL[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      requests.push(parsed);
      if (url.includes("/api/views/")) {
        return json(metadata);
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([sfhTarget]);
      }
      if (parsed.searchParams.get("$select")?.startsWith("parcel_id")) {
        return json(selected);
      }
      if (parsed.searchParams.get("$where")?.startsWith("parcel_id in")) {
        return json(details);
      }
      if (parsed.searchParams.get("$where")?.startsWith("document_number in")) {
        return json(details);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const data = await fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650");
    assert.equal(data.sales.length, 25);
    assert.equal(data.candidateCoverage.selectionLimit, 25);
    assert.equal(data.candidateCoverage.selectedParcelCount, 25);
    assert.ok(requests.some((url) => url.searchParams.get("$limit") === "25"));
    assert.ok(requests.filter((url) => url.searchParams.get("$limit") === "1000").length >= 3);
    assert.match(data.sales[0]?.selectionReason ?? "", /most recent 25 distinct/i);
  });

  it("rejects a publication that changes between metadata start and end", async () => {
    let metadataReads = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      const parsed = new URL(url);
      if (url.includes("/api/views/")) {
        metadataReads += 1;
        return json(
          metadataReads === 1
            ? metadata
            : { ...metadata, rowsUpdatedAt: metadata.rowsUpdatedAt + 1 },
        );
      }
      if (parsed.searchParams.get("parcel_id") === "32464650") {
        return json([target]);
      }
      if (parsed.searchParams.has("$select")) {
        return json([]);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    await assert.rejects(
      fetchNorfolkDealData(fetchImpl as typeof fetch, "32464650"),
      /changed during enrichment/i,
    );
  });
});
