export type JsonValue =
  | null | boolean | number | string
  | JsonValue[] | { [key: string]: JsonValue };

export type Difference =
  | { kind: "added"; path: string; after: JsonValue }
  | { kind: "removed"; path: string; before: JsonValue }
  | { kind: "changed"; path: string; before: JsonValue; after: JsonValue };

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// JSON Pointer escaping keeps keys containing '/' or '~' unambiguous.
function childPath(parent: string, key: string | number): string {
  return `${parent}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

export function diffJson(before: JsonValue, after: JsonValue, path = ""): Difference[] {
  if (before === after) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    const differences: Difference[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const itemPath = childPath(path, i);
      if (i >= before.length) {
        differences.push({ kind: "added", path: itemPath, after: after[i]! });
      } else if (i >= after.length) {
        differences.push({ kind: "removed", path: itemPath, before: before[i]! });
      } else {
        differences.push(...diffJson(before[i]!, after[i]!, itemPath));
      }
    }
    return differences;
  }

  if (isObject(before) && isObject(after)) {
    const differences: Difference[] = [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const itemPath = childPath(path, key);
      if (!Object.hasOwn(before, key)) {
        differences.push({ kind: "added", path: itemPath, after: after[key]! });
      } else if (!Object.hasOwn(after, key)) {
        differences.push({ kind: "removed", path: itemPath, before: before[key]! });
      } else {
        differences.push(...diffJson(before[key]!, after[key]!, itemPath));
      }
    }
    return differences;
  }

  return [{ kind: "changed", path, before, after }];
}
