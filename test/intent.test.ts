import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { compareSnapshots } from "../src/compare.js";
import { diffJson, type JsonValue, type Difference } from "../src/diff.js";

const cases: {
  name: string;
  before: JsonValue;
  after: JsonValue;
  expected: Difference[];
}[] = [
  {
    name: "empty nested objects are equal",
    before: { a: {} },
    after: { a: {} },
    expected: [],
  },
  {
    name: "null is not a missing field",
    before: { a: null },
    after: {},
    expected: [{ kind: "removed", path: "/a", before: null }],
  },
  {
    name: "new null field is an addition",
    before: {},
    after: { a: null },
    expected: [{ kind: "added", path: "/a", after: null }],
  },
  {
    name: "false is not zero",
    before: false,
    after: 0,
    expected: [{ kind: "changed", path: "", before: false, after: 0 }],
  },
  {
    name: "number is not a numeric string",
    before: 80,
    after: "80",
    expected: [{ kind: "changed", path: "", before: 80, after: "80" }],
  },
  {
    name: "an empty string is not null",
    before: "",
    after: null,
    expected: [{ kind: "changed", path: "", before: "", after: null }],
  },
  {
    name: "array order matters",
    before: [1, 2],
    after: [2, 1],
    expected: [
      { kind: "changed", path: "/0", before: 1, after: 2 },
      { kind: "changed", path: "/1", before: 2, after: 1 },
    ],
  },
  {
    name: "array tail removals preserve null",
    before: [1, null],
    after: [1],
    expected: [{ kind: "removed", path: "/1", before: null }],
  },
  {
    name: "an array and an object are different types",
    before: [],
    after: {},
    expected: [{ kind: "changed", path: "", before: [], after: {} }],
  },
  {
    name: "nested array changes keep the exact index",
    before: { a: [{ id: 1 }] },
    after: { a: [{ id: 2 }] },
    expected: [{ kind: "changed", path: "/a/0/id", before: 1, after: 2 }],
  },
  {
    name: "empty property names have an unambiguous pointer",
    before: { "": 1 },
    after: { "": 2 },
    expected: [{ kind: "changed", path: "/", before: 1, after: 2 }],
  },
  {
    name: "slashes and tildes are escaped",
    before: { "a/~": 1 },
    after: { "a/~": 2 },
    expected: [{ kind: "changed", path: "/a~1~0", before: 1, after: 2 }],
  },
  {
    name: "Unicode field names and values remain intact",
    before: { ısı: "soğuk" },
    after: { ısı: "sıcak" },
    expected: [
      { kind: "changed", path: "/ısı", before: "soğuk", after: "sıcak" },
    ],
  },
  {
    name: "timestamps are differences until ignore rules exist",
    before: { updatedAt: "2026-10-25" },
    after: { updatedAt: "2026-10-28" },
    expected: [
      {
        kind: "changed",
        path: "/updatedAt",
        before: "2026-10-25",
        after: "2026-10-28",
      },
    ],
  },
  {
    name: "a parent type change is one replacement",
    before: { a: { x: 1 } },
    after: { a: false },
    expected: [{ kind: "changed", path: "/a", before: { x: 1 }, after: false }],
  },
];

for (const scenario of cases) {
  test(`intent: ${scenario.name}`, () => {
    const before = structuredClone(scenario.before);
    const after = structuredClone(scenario.after);
    assert.deepEqual(diffJson(before, after), scenario.expected);
    assert.deepEqual(
      before,
      scenario.before,
      "Comparison must not mutate the reference",
    );
    assert.deepEqual(
      after,
      scenario.after,
      "Comparison must not mutate the target",
    );
  });
}

test("intent: status codes participate in equality independently of JSON", () => {
  const base = { url: "http://base/", status: 200, body: { ok: true } };
  const target = { url: "http://target/", status: 201, body: { ok: true } };
  const result = compareSnapshots(base, target);
  assert.equal(result.matches, false);
  assert.deepEqual(result.differences, []);
});

test("intent: identical error responses are equal observations, not a health check", () => {
  const base = {
    url: "http://base/",
    status: 401,
    body: { error: "login required" },
  };
  const target = { ...base, url: "http://target/" };
  assert.equal(compareSnapshots(base, target).matches, true);
});

test("intent: generated JSON agrees with an independent equality oracle", () => {
  let seed = 78421;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  function value(depth: number): JsonValue {
    const choice = next() % (depth ? 6 : 4);
    if (choice === 0) return null;
    if (choice === 1) return Boolean(next() % 2);
    if (choice === 2) return (next() % 100) - 50;
    if (choice === 3) return ["", "GT1", "a/b~", "ısı"][next() % 4]!;
    if (choice === 4)
      return Array.from({ length: next() % 4 }, () => value(depth - 1));
    return Object.fromEntries(
      Array.from({ length: next() % 4 }, (_, i) => [`k${i}`, value(depth - 1)]),
    );
  }
  for (let i = 0; i < 200; i++) {
    const before = value(3);
    const after = i % 3 === 0 ? structuredClone(before) : value(3);
    assert.equal(
      diffJson(before, after).length === 0,
      isDeepStrictEqual(before, after),
      `Generated pair ${i}`,
    );
  }
});
