import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Mutate isolated compiled copies. Never edit the app's source or running assets.
const workRoot = resolve("work");
await mkdir(workRoot, { recursive: true });
const root = await mkdtemp(join(workRoot, "mutations-"));
assert.equal(dirname(root), workRoot);
const sources = {
  "diff.js": await readFile("dist/src/diff.js", "utf8"),
  "compare.js": await readFile("dist/src/compare.js", "utf8"),
};
const intentTests = await readFile("dist/test/intent.test.js", "utf8");
const mutations = [
  {
    name: "ignore all JSON differences",
    file: "diff.js",
    edit: (text) =>
      text.replace(/(export function diffJson\([^)]*\) \{)/, "$1\nreturn [];"),
  },
  {
    name: "ignore removed fields and array items",
    file: "diff.js",
    edit: (text) =>
      text.replace(/differences\.push\(\{ kind: "removed"[^;]+;/g, ""),
  },
  {
    name: "treat numeric strings and numbers as equal",
    file: "diff.js",
    edit: (text) =>
      text.replace(
        "if (before === after)",
        "if (before === after || (typeof before !== 'object' && typeof after !== 'object' && String(before) === String(after)))",
      ),
  },
  {
    name: "ignore HTTP status differences",
    file: "compare.js",
    edit: (text) =>
      text.replace(
        "base.status === target.status && differences.length === 0",
        "differences.length === 0",
      ),
  },
];

try {
  for (const [index, mutation] of mutations.entries()) {
    const folder = join(root, String(index));
    await mkdir(join(folder, "src"), { recursive: true });
    await mkdir(join(folder, "test"));
    await writeFile(join(folder, "package.json"), '{"type":"module"}');
    await writeFile(join(folder, "test/intent.test.js"), intentTests);
    for (const [file, original] of Object.entries(sources)) {
      const text = file === mutation.file ? mutation.edit(original) : original;
      if (file === mutation.file)
        assert.notEqual(
          text,
          original,
          `Mutation did not apply: ${mutation.name}`,
        );
      const path = join(folder, "src", file);
      await writeFile(path, text);
      const syntax = spawnSync(process.execPath, ["--check", path], {
        encoding: "utf8",
      });
      assert.equal(syntax.status, 0, syntax.stderr);
    }
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=tap", join(folder, "test/intent.test.js")],
      { encoding: "utf8", timeout: 15000 },
    );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      1,
      `The tests missed this deliberately broken implementation: ${mutation.name}`,
    );
    assert.match(
      result.stdout,
      /ERR_ASSERTION/,
      `Expected an assertion failure, not a broken test setup: ${mutation.name}\n${result.stdout}\n${result.stderr}`,
    );
    console.log(`CAUGHT: ${mutation.name}`);
  }
  console.log(
    `${mutations.length}/${mutations.length} targeted mutations were detected. This is not an exhaustive mutation score.`,
  );
} finally {
  // root is a verified, newly created child of the project's work directory.
  assert.equal(dirname(root), workRoot);
  await rm(root, { recursive: true, force: true });
}
