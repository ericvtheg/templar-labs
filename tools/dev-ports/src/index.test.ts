import assert from "node:assert/strict";
import test from "node:test";
import { checkDevPorts, devPort, devPorts } from "./index.ts";

test("devPort returns a registered port", () => {
  assert.equal(devPort("hello-world-web"), 5173);
});

test("registered dev ports are valid", () => {
  assert.deepEqual(checkDevPorts(), []);
});

test("registered dev ports are unique", () => {
  const ports = Object.values(devPorts);

  assert.equal(new Set(ports).size, ports.length);
});
