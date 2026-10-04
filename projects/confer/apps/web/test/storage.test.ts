import assert from "node:assert/strict";
import test from "node:test";
import { createDemoWorkspace } from "../src/lib/demo.ts";
import { matterDetailsSchema, workspaceSchema } from "../src/lib/model.ts";
import { forgetWorkspace, loadWorkspace, STORAGE_KEY, saveWorkspace } from "../src/lib/storage.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

test("a fresh browser does not write or persist a workspace", () => {
  const storage = memoryStorage();
  assert.equal(loadWorkspace(storage), null);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test("explicit saving round-trips documents, review decisions, and notes", () => {
  const storage = memoryStorage();
  const workspace = createDemoWorkspace();
  const response = workspace.matters[0]?.responses[0];
  assert.ok(response);
  response.status = "reviewed";
  response.note = "Review note.";
  saveWorkspace(storage, workspace);
  assert.deepEqual(loadWorkspace(storage), workspace);
  forgetWorkspace(storage);
  assert.equal(loadWorkspace(storage), null);
});

test("rejects corrupt or incompatible data without silently deleting it", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, "not JSON");
  assert.throws(() => loadWorkspace(storage));
  assert.equal(storage.getItem(STORAGE_KEY), "not JSON");
  storage.setItem(STORAGE_KEY, '{"version":999}');
  assert.throws(() => loadWorkspace(storage));
});

test("rejects orphaned provenance, duplicate IDs, and nonexistent active matters", () => {
  const workspace = createDemoWorkspace();
  const response = workspace.matters[0]?.responses[0];
  assert.ok(response);
  response.documentId = "missing";
  assert.ok(!workspaceSchema.safeParse(workspace).success);
  const duplicate = createDemoWorkspace();
  assert.ok(duplicate.matters[0]);
  duplicate.matters.push(duplicate.matters[0]);
  assert.ok(!workspaceSchema.safeParse(duplicate).success);
  const inactive = createDemoWorkspace();
  inactive.activeMatterId = "unknown";
  assert.ok(!workspaceSchema.safeParse(inactive).success);
});

test("quota and unavailable-storage failures remain visible to callers", () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.throws(() => loadWorkspace(storage), /blocked/);
  assert.throws(() => saveWorkspace(storage, createDemoWorkspace()), /quota/);
  assert.throws(() => forgetWorkspace(storage), /blocked/);
});

test("dates and matter names are validated without throwing for malformed dates", () => {
  const matter = createDemoWorkspace().matters[0];
  assert.ok(matter);
  assert.ok(matterDetailsSchema.safeParse(matter).success);
  assert.ok(!matterDetailsSchema.safeParse({ ...matter, title: "   " }).success);
  for (const date of ["2026-02-30", "2026-99-99", "tomorrow"]) {
    assert.ok(!matterDetailsSchema.safeParse({ ...matter, responseBy: date }).success);
  }
});
