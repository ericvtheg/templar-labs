import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkPalette,
  contrastRatio,
  generateDirections,
  nonColorDistance,
  toCss,
  validateIdentity,
} from "../.pi/skills/brand-direction/scripts/generate.mjs";

const script = fileURLToPath(
  new URL("../.pi/skills/brand-direction/scripts/generate.mjs", import.meta.url),
);

test("uses the WCAG luminance formula without rounding threshold values", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#123456", "#123456"), 1);
  assert.ok(contrastRatio("#777777", "#FFFFFF") < 4.5);
  assert.ok(contrastRatio("#767676", "#FFFFFF") >= 4.5);
  assert.throws(() => contrastRatio("#fff", "#000000"), /six-digit/);
});

test("reproduces a saved seed and varies fresh seeds", () => {
  const args = { product: "Test product", seed: "saved-seed" };
  assert.deepEqual(generateDirections(args), generateDirections(args));
  assert.notDeepEqual(
    generateDirections(args),
    generateDirections({ ...args, seed: "other-seed" }),
  );
  const fresh = generateDirections({ product: "Test product" });
  assert.match(fresh.seed, /^[\da-f]{32}$/);
  assert.notEqual(fresh.seed, generateDirections({ product: "Test product" }).seed);
});

test("candidates vary at least three non-color dimensions and all declared pairs pass", () => {
  for (let seed = 0; seed < 300; seed++) {
    const { directions } = generateDirections({
      product: "Test product",
      seed: String(seed),
      count: 5,
    });
    for (const [index, direction] of directions.entries()) {
      assert.equal(checkPalette(direction.palette).length, 20);
      for (const check of direction.contrastChecks) {
        assert.ok(check.ratio >= check.minimum);
      }
      for (const previous of directions.slice(0, index)) {
        assert.ok(nonColorDistance(direction.fingerprint, previous.fingerprint) >= 3);
      }
    }
  }
});

test("respects a theme constraint and avoids previously selected identities", () => {
  const previous = generateDirections({ product: "Earlier product", seed: "earlier" })
    .directions[0];
  for (const mode of ["light", "dark"]) {
    const { directions } = generateDirections({
      product: "New product",
      seed: "new",
      mode,
      avoid: [previous.fingerprint],
    });
    for (const direction of directions) {
      assert.equal(direction.mode, mode);
      assert.ok(nonColorDistance(direction.fingerprint, previous.fingerprint) >= 3);
    }
  }
});

test("rejects invalid inputs, unreadable overrides, and unsafe CSS values", () => {
  assert.throws(() => generateDirections({ product: " " }), /product name/);
  assert.throws(() => generateDirections({ product: "Test", count: 6 }), /Count/);
  assert.throws(() => generateDirections({ product: "Test", seed: "" }), /seed/);
  assert.throws(() => generateDirections({ product: "Test", mode: "automatic" }), /Mode/);
  assert.throws(() => generateDirections({ product: "Test", avoid: [{}] }), /fingerprint/);
  const direction = generateDirections({ product: "Test", seed: "validation" }).directions[0];
  assert.throws(
    () => checkPalette({ ...direction.palette, text: direction.palette.canvas }),
    /contrast/,
  );
  assert.throws(
    () =>
      toCss({
        ...direction,
        typography: { ...direction.typography, display: 'Bad"; color: red;' },
      }),
    /font-family/,
  );
  assert.throws(
    () => toCss({ ...direction, geometry: { ...direction.geometry, cardRadius: "12; color:red" } }),
    /cardRadius/,
  );
});

test("exports semantic CSS from one selected identity without mutating it", () => {
  const generated = generateDirections({ product: "Test", seed: "export" });
  const identity = {
    version: 1,
    product: generated.product,
    seed: generated.seed,
    direction: generated.directions[0],
  };
  const before = JSON.stringify(identity);
  assert.equal(validateIdentity(identity), identity.direction);
  const css = toCss(identity);
  assert.match(css, /--brand-on-primary: #[\dA-F]{6};/);
  assert.match(css, /--brand-font-body:/);
  assert.match(css, /--brand-radius-card: \d+px;/);
  assert.equal(JSON.stringify(identity), before);
});

test("CLI generates, validates, emits CSS, and avoids saved identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brand-direction-test-"));
  try {
    const generated = spawnSync(
      process.execPath,
      [script, "--product", "Test CLI", "--seed", "cli"],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0, generated.stderr);
    const output = JSON.parse(generated.stdout);
    const identity = {
      version: 1,
      product: output.product,
      seed: output.seed,
      direction: output.directions[0],
    };
    const path = join(directory, "identity.json");
    await writeFile(path, JSON.stringify(identity));
    const checked = spawnSync(process.execPath, [script, "--check", path], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).valid, true);
    const css = spawnSync(process.execPath, [script, "--css", path], { encoding: "utf8" });
    assert.equal(css.status, 0, css.stderr);
    assert.match(css.stdout, /:root \{/);
    const avoided = spawnSync(
      process.execPath,
      [script, "--product", "Test CLI", "--seed", "cli", "--avoid", path],
      { encoding: "utf8" },
    );
    assert.equal(avoided.status, 0, avoided.stderr);
    for (const direction of JSON.parse(avoided.stdout).directions) {
      assert.ok(nonColorDistance(direction.fingerprint, identity.direction.fingerprint) >= 3);
    }
    const invalid = spawnSync(process.execPath, [script, "--count", "9"], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
