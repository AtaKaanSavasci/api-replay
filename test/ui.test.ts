import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test, { type TestContext } from "node:test";
import { createUiServer } from "../src/ui-server.js";

async function listen(t: TestContext, server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function post(
  origin: string,
  input: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}/api/compare`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify(input),
  });
}

test("serves the UI and its assets without exposing source files", async (t) => {
  const origin = await listen(t, await createUiServer());
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-security-policy")!,
    /frame-ancestors 'none'/,
  );
  assert.match(await response.text(), /Compare responses/);
  for (const [path, type] of [
    ["/styles.css", "text/css"],
    ["/app.js", "text/javascript"],
  ]) {
    const asset = await fetch(origin + path);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type")!, new RegExp(type!));
  }
  assert.equal((await fetch(origin + "/package.json")).status, 404);
});

test("built-in example contains actual diffs and needs no demo servers", async (t) => {
  const origin = await listen(t, await createUiServer());
  const result = await (await fetch(origin + "/api/example")).json();
  assert.equal(result.matches, false);
  assert.deepEqual(
    result.differences.map((item: { kind: string }) => item.kind),
    ["changed", "added", "removed"],
  );
  assert.equal(result.differences[0].path, "/readings/temperature");
});

test("UI compare endpoint reports live field and status differences", async (t) => {
  const base = await listen(
    t,
    createServer((_, res) => res.end('{"status":"active"}')),
  );
  const target = await listen(
    t,
    createServer((_, res) => {
      res.writeHead(202);
      res.end('{"state":"active"}');
    }),
  );
  const origin = await listen(t, await createUiServer());
  const response = await post(origin, { base, target, path: "/equipment/1" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.matches, false);
  assert.equal(result.base.status, 200);
  assert.equal(result.target.status, 202);
  assert.deepEqual(
    result.differences.map((item: { kind: string }) => item.kind),
    ["added", "removed"],
  );
});

test("matching JSON error responses retain their HTTP status", async (t) => {
  const api = await listen(
    t,
    createServer((_, res) => {
      res.writeHead(401);
      res.end('{"error":"login required"}');
    }),
  );
  const origin = await listen(t, await createUiServer());
  const result = await (
    await post(origin, { base: api, target: api, path: "/shifts" })
  ).json();
  assert.equal(result.matches, true);
  assert.equal(result.base.status, 401);
  assert.deepEqual(result.differences, []);
});

test("rejects cross-origin requests before contacting either API", async (t) => {
  let hits = 0;
  const api = await listen(
    t,
    createServer((_, res) => {
      hits++;
      res.end("{}");
    }),
  );
  const origin = await listen(t, await createUiServer());
  const response = await post(
    origin,
    { base: api, target: api, path: "/" },
    { origin: "https://example.com" },
  );
  assert.equal(response.status, 403);
  assert.equal(hits, 0);
});

test("validates both URLs before sending requests and checks content type", async (t) => {
  let hits = 0;
  const api = await listen(
    t,
    createServer((_, res) => {
      hits++;
      res.end("{}");
    }),
  );
  const origin = await listen(t, await createUiServer());
  for (const input of [
    null,
    [],
    {},
    { base: api, target: "not-a-url", path: "/" },
    { base: api, target: api, path: "//example.com" },
  ]) {
    assert.equal((await post(origin, input)).status, 400);
  }
  assert.equal(
    (await post(origin, {}, { "content-type": "text/plain" })).status,
    415,
  );
  assert.equal(hits, 0);
});

test("reports malformed or oversized JSON with useful errors", async (t) => {
  const origin = await listen(t, await createUiServer());
  const invalid = await fetch(origin + "/api/compare", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /valid JSON/);
  assert.equal((await post(origin, { value: "x".repeat(20000) })).status, 413);
});

test("reports non-JSON upstream responses as comparison failures", async (t) => {
  const api = await listen(
    t,
    createServer((_, res) => res.end("not JSON")),
  );
  const origin = await listen(t, await createUiServer());
  const response = await post(origin, { base: api, target: api, path: "/" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /did not return valid JSON/);
});
