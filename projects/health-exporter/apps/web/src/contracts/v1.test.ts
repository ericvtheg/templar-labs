import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { sampleIngestionRequestV1Schema } from "./v1.ts";

it("accepts the shared Swift/TypeScript v1 fixture", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../../../../contracts/v1-valid-request.json", import.meta.url), "utf8"),
  );

  expect(sampleIngestionRequestV1Schema.safeParse(fixture).success).toBe(true);
});
