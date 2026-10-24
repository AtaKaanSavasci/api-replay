import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { compareApis, fetchJson, requestUrl } from "../src/compare.js";

async function fixture(t: TestContext, handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") return reject(error);
      resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
    });
  });
}

test("keeps query parameters and rejects ambiguous origins or paths", () => {
  assert.equal(requestUrl("http://localhost:3000", "/equipment?id=1").href,
    "http://localhost:3000/equipment?id=1");
  for (const origin of ["file:///tmp/", "http://localhost/api", "http://user:pass@localhost", "http://localhost?q=1"]) {
    assert.throws(() => requestUrl(origin, "/health"));
  }
  for (const path of ["health", "//example.com/path", "/\\example.com/path", "/health#fragment"]) {
    assert.throws(() => requestUrl("http://localhost", path));
  }
});

test("CLI sends a real GET with its query and returns 0 for equal responses", async t => {
  const origin = await fixture(t, (request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/equipment/1?view=full");
    assert.equal(request.headers.accept, "application/json");
    response.end('{"id":1}');
  });
  const result = await runCli(["--base", origin, "--target", origin, "--path", "/equipment/1?view=full"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /MATCH:/);
});

test("CLI returns 1 and prints nested, added and removed differences", async t => {
  const base = await fixture(t, (_, res) => res.end('{"status":"active","readings":{"temperature":80}}'));
  const target = await fixture(t, (_, res) => res.end('{"state":"active","readings":{"temperature":85}}'));
  const result = await runCli(["--base", base, "--target", target, "--path", "/equipment/1"]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /~ \/readings\/temperature: 80 -> 85/);
  assert.match(result.stdout, /\+ \/state: "active"/);
  assert.match(result.stdout, /- \/status: "active"/);
});

test("HTTP status differences count even when JSON is identical", async t => {
  const base = await fixture(t, (_, res) => res.end('{"ok":false}'));
  const target = await fixture(t, (_, res) => {
    res.writeHead(503);
    res.end('{"ok":false}');
  });
  const result = await runCli(["--base", base, "--target", target, "--path", "/health"]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /HTTP status: 200 -> 503/);
});

test("matching JSON error responses are equal, rather than a request failure", async t => {
  const origin = await fixture(t, (_, res) => {
    res.writeHead(404);
    res.end('{"error":"not found"}');
  });
  assert.equal((await compareApis(origin, origin, "/missing")).matches, true);
});

test("invalid JSON produces exit code 2 and an actionable diagnostic", async t => {
  const origin = await fixture(t, (_, res) => res.end("<html>not JSON</html>"));
  const result = await runCli(["--base", origin, "--target", origin, "--path", "/"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /HTTP 200 did not return valid JSON/);
});

test("empty responses are explicitly unsupported", async t => {
  const origin = await fixture(t, (_, res) => { res.writeHead(204); res.end(); });
  await assert.rejects(fetchJson(new URL(origin)), /empty bodies are unsupported/);
});

test("redirects are reported without requesting their destination", async t => {
  let destinationHits = 0;
  const origin = await fixture(t, (req, res) => {
    if (req.url === "/final") destinationHits++;
    res.writeHead(302, { location: "/final" });
    res.end();
  });
  await assert.rejects(fetchJson(new URL(origin)), /HTTP 302 redirect/);
  assert.equal(destinationHits, 0);
});

test("times out when the server leaves a response unfinished", async t => {
  const origin = await fixture(t, (_, res) => { res.writeHead(200); res.write("{"); });
  await assert.rejects(fetchJson(new URL(origin), 50), /timed out after 50 ms/);
});

test("CLI validates arguments and exposes help", async () => {
  assert.equal((await runCli([])).code, 2);
  assert.equal((await runCli(["--unknown"])).code, 2);
  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Exit codes:/);
});
