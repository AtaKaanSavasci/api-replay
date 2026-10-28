import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { compareApis, compareSnapshots, requestUrl } from "./compare.js";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 16384) chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      if (size > 16384)
        return reject(new HttpError(413, "Request body is too large."));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });
  });
}

export async function createUiServer() {
  const assets = new Map(
    await Promise.all(
      [
        ["/", "index.html", "text/html"],
        ["/styles.css", "styles.css", "text/css"],
        ["/app.js", "app.js", "text/javascript"],
      ].map(
        async ([path, file, type]) =>
          [
            path!,
            {
              body: await readFile(
                new URL(`../../public/${file}`, import.meta.url),
              ),
              type: `${type}; charset=utf-8`,
            },
          ] as const,
      ),
    ),
  );

  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );

    void (async () => {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new HttpError(503, "Server is not ready.");
      const host = request.headers.host;
      if (
        host !== `127.0.0.1:${address.port}` &&
        host !== `localhost:${address.port}`
      ) {
        throw new HttpError(403, "Open the UI using its localhost address.");
      }
      const path = new URL(request.url ?? "/", `http://${host}`).pathname;
      const asset = assets.get(path);
      if (asset && request.method === "GET") {
        response.writeHead(200, { "content-type": asset.type });
        response.end(asset.body);
        return;
      }
      if (path === "/api/example" && request.method === "GET") {
        const result = compareSnapshots(
          {
            url: "http://127.0.0.1:4010/equipment/1",
            status: 200,
            body: {
              id: 1,
              name: "GT1",
              status: "active",
              readings: { temperature: 80 },
            },
          },
          {
            url: "http://127.0.0.1:4011/equipment/1",
            status: 200,
            body: {
              id: 1,
              name: "GT1",
              state: "active",
              readings: { temperature: 85 },
            },
          },
        );
        json(response, 200, result);
        return;
      }
      if (path !== "/api/compare") throw new HttpError(404, "Not found.");
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        throw new HttpError(405, "Use POST to compare responses.");
      }
      // Only this local UI may ask the server to issue API requests.
      if (
        request.headers.origin !== `http://${host}` ||
        request.headers["sec-fetch-site"] === "cross-site"
      ) {
        throw new HttpError(
          403,
          "Comparisons must be started from the local UI.",
        );
      }
      if (
        request.headers["content-type"]?.split(";")[0]?.trim() !==
        "application/json"
      ) {
        throw new HttpError(415, "Content-Type must be application/json.");
      }
      const input = await readBody(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new HttpError(400, "Provide base, target and path strings.");
      }
      const { base, target, path: endpoint } = input as Record<string, unknown>;
      if (
        typeof base !== "string" ||
        typeof target !== "string" ||
        typeof endpoint !== "string" ||
        !base.trim() ||
        !target.trim() ||
        !endpoint.trim()
      ) {
        throw new HttpError(400, "Provide base, target and path strings.");
      }
      try {
        requestUrl(base, endpoint);
        requestUrl(target, endpoint);
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Invalid URL.",
        );
      }
      try {
        json(response, 200, await compareApis(base, target, endpoint));
      } catch (error) {
        throw new HttpError(
          502,
          error instanceof Error ? error.message : "The comparison failed.",
        );
      }
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        json(response, error instanceof HttpError ? error.status : 500, {
          error:
            error instanceof HttpError
              ? error.message
              : "An unexpected server error occurred.",
        });
      } else response.end();
    });
  });
  server.requestTimeout = 10000;
  return server;
}
