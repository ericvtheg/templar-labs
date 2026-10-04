import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FILE_BYTES, validateFile } from "../src/lib/documents.ts";

test("accepts only supported nonempty document formats within the size limit", () => {
  for (const extension of ["pdf", "DOCX", "txt"]) {
    assert.equal(validateFile({ name: `file.${extension}`, size: 1_000 }), extension.toLowerCase());
  }
  assert.throws(() => validateFile({ name: "file.exe", size: 100 }), /Choose a text-based PDF/);
  assert.throws(() => validateFile({ name: "file.txt", size: 0 }), /empty/);
  assert.throws(
    () => validateFile({ name: "file.pdf", size: MAX_FILE_BYTES + 1 }),
    /larger than 10 MB/,
  );
});
