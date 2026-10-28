import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test as base, expect, type Page } from "@playwright/test";
import { createUiServer } from "../dist/src/ui-server.js";

type Reply = {
  status?: number;
  body?: unknown;
  raw?: string;
  headers?: Record<string, string>;
  wait?: Promise<void>;
  hang?: boolean;
};
type Hit = {
  side: string;
  method: string | undefined;
  url: string | undefined;
  accept: string | undefined;
};

async function start(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test server address.");
  return `http://127.0.0.1:${address.port}`;
}

async function stop(server: Server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function createLab() {
  const hits: Hit[] = [];
  const routes = {
    base: new Map<string, Reply>(),
    target: new Map<string, Reply>(),
  };
  const servers: Server[] = [];
  function api(side: "base" | "target") {
    return createServer((req, res) => {
      hits.push({
        side,
        method: req.method,
        url: req.url,
        accept: req.headers.accept,
      });
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      const reply = routes[side].get(path) ?? {
        status: 404,
        body: { error: "Fixture not found" },
      };
      void (async () => {
        if (reply.wait) await reply.wait;
        if (res.destroyed) return;
        res.writeHead(reply.status ?? 200, {
          "content-type": "application/json",
          ...reply.headers,
        });
        if (reply.hang) {
          res.write("{");
          return;
        }
        res.end(
          "raw" in reply
            ? reply.raw
            : JSON.stringify("body" in reply ? reply.body : { ok: true }),
        );
      })().catch(() => res.destroy());
    });
  }
  const baseServer = api("base");
  const targetServer = api("target");
  servers.push(baseServer, targetServer);
  try {
    const baseOrigin = await start(baseServer);
    const targetOrigin = await start(targetServer);
    const ui = await createUiServer();
    servers.push(ui);
    const origin = await start(ui);
    return {
      origin,
      baseOrigin,
      targetOrigin,
      hits,
      respond(path: string, reference: Reply, target: Reply = reference) {
        routes.base.set(path, reference);
        routes.target.set(path, target);
      },
      closeTarget: () => stop(targetServer),
      close: () => Promise.all(servers.map(stop)),
    };
  } catch (error) {
    await Promise.all(servers.map(stop));
    throw error;
  }
}

export type Lab = Awaited<ReturnType<typeof createLab>>;

export const test = base.extend<{ lab: Lab }>({
  lab: async ({}, use) => {
    const lab = await createLab();
    try {
      await use(lab);
    } finally {
      await lab.close();
    }
  },
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "The app must not throw unhandled browser errors").toEqual(
      [],
    );
  },
});

export { expect };

export async function open(page: Page, lab: Lab) {
  await page.goto(lab.origin);
  await expect(page.locator("#result-mode")).toHaveText("EXAMPLE");
  await expect(page.locator("#compare-button")).toBeEnabled();
}

export async function submit(page: Page, lab: Lab, path: string) {
  await page.locator("#base").fill(lab.baseOrigin);
  await page.locator("#target").fill(lab.targetOrigin);
  await page.locator("#path").fill(path);
  await page
    .getByRole("button", { name: "Compare responses", exact: true })
    .click();
  await expect(page.locator("#compare-button")).toBeEnabled();
}

export async function rows(page: Page) {
  return page
    .locator("#diff-body tr")
    .evaluateAll((elements) =>
      elements.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim()),
      ),
    );
}
