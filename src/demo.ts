import { createServer, type Server } from "node:http";

const servers: Server[] = [];
for (const [port, version] of [[4010, "base"], [4011, "target"]] as const) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end(JSON.stringify({ error: "GET only" }));
    } else if (path === "/health") {
      response.end(JSON.stringify({ ok: true }));
    } else if (path === "/equipment/1") {
      const equipment = version === "base"
        ? { id: 1, name: "GT1", status: "active", readings: { temperature: 80 } }
        : { id: 1, name: "GT1", state: "active", readings: { temperature: 85 } };
      response.end(JSON.stringify(equipment));
    } else {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "Not found" }));
    }
  });
  servers.push(server);
  server.on("error", (error) => {
    console.error(`Demo server ${port}: ${error.message}`);
    process.exitCode = 2;
    for (const other of servers) other.close();
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`${version}: http://127.0.0.1:${port} — /equipment/1 (different), /health (equal)`);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const server of servers) server.close();
  });
}
