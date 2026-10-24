import assert from "node:assert/strict";
import test from "node:test";
import { diffJson } from "../src/diff.js";

test("object key order does not create a difference", () => {
  assert.deepEqual(diffJson({ id: 1, name: "GT1" }, { name: "GT1", id: 1 }), []);
});

test("reports added and removed fields, including null", () => {
  assert.deepEqual(diffJson({ status: "active" }, { state: null }), [
    { kind: "added", path: "/state", after: null },
    { kind: "removed", path: "/status", before: "active" },
  ]);
});

test("finds nested changes and distinguishes number from string", () => {
  assert.deepEqual(diffJson({ readings: { temperature: 80 } }, { readings: { temperature: "80" } }), [
    { kind: "changed", path: "/readings/temperature", before: 80, after: "80" },
  ]);
});

test("compares arrays by index and reports additions and removals", () => {
  assert.deepEqual(diffJson([1, 2], [2, 1, 3]), [
    { kind: "changed", path: "/0", before: 1, after: 2 },
    { kind: "changed", path: "/1", before: 2, after: 1 },
    { kind: "added", path: "/2", after: 3 },
  ]);
  assert.deepEqual(diffJson([null], []), [{ kind: "removed", path: "/0", before: null }]);
});

test("distinguishes empty objects, arrays and null at the root", () => {
  assert.deepEqual(diffJson({}, []), [{ kind: "changed", path: "", before: {}, after: [] }]);
  assert.deepEqual(diffJson(null, {}), [{ kind: "changed", path: "", before: null, after: {} }]);
  assert.deepEqual(diffJson(false, false), []);
});

test("escapes JSON Pointer paths and handles special property names", () => {
  assert.deepEqual(diffJson({ "a/b~c": 1 }, { "a/b~c": 2 }), [
    { kind: "changed", path: "/a~1b~0c", before: 1, after: 2 },
  ]);
  assert.deepEqual(diffJson({}, JSON.parse('{"__proto__":null}')), [
    { kind: "added", path: "/__proto__", after: null },
  ]);
});
