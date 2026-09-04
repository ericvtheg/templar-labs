import assert from "node:assert/strict";
import { test } from "node:test";
import { createForm, normalizeWord, PARTICLE_COUNT, readState, writeState } from "../src/forms.ts";

for (const form of ["saturn", "galaxy", "bloom", "helix"] as const) {
  test(`${form} produces a complete, finite, bounded sculpture`, () => {
    const points = createForm(form);
    assert.equal(points.length, PARTICLE_COUNT * 3);
    assert.ok(points.every(Number.isFinite));
    assert.ok(points.every((value) => Math.abs(value) < 4));
    const xs = points.filter((_, i) => i % 3 === 0);
    const ys = points.filter((_, i) => i % 3 === 1);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 2);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 1);
  });
}

test("shared universes preserve their form, palette, intensity, and Unicode text", () => {
  const state = { form: "word", palette: "ocean", energy: 72, word: "CAFÉ & YOU" } as const;
  assert.deepEqual(readState(writeState(state)), state);
});

test("invalid links fall back safely and bound expensive inputs", () => {
  assert.deepEqual(readState("?form=unknown&palette=unknown&energy=Infinity&word=%20"), {
    form: "saturn",
    palette: "dusk",
    energy: 35,
    word: "HELLO",
  });
  assert.equal(readState("?energy=-10").energy, 0);
  assert.equal(readState("?energy=99999").energy, 100);
  assert.equal(readState(`?word=${"a".repeat(1000)}`).word.length, 12);
});

test("personalized text bounds Unicode characters and removes invisible controls", () => {
  assert.equal(normalizeWord("\u200b\u200d"), "");
  assert.equal(readState("?form=word&word=%E2%80%8B").word, "HELLO");
  assert.equal(normalizeWord("ß".repeat(12)).length, 12);
  assert.equal(Array.from(normalizeWord("🌟".repeat(20))).length, 12);
});
