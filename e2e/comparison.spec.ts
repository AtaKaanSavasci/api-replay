import { readFile } from "node:fs/promises";
import { test, expect, open, submit, rows } from "./fixtures.js";

test("example is labeled and does not submit a live comparison", async ({
  page,
  lab,
}) => {
  const comparisonRequests: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/compare")
      comparisonRequests.push(req.url());
  });
  await open(page, lab);
  await expect(page.locator("#result-title")).toHaveText("3 changes found");
  await expect(page.locator("#result-caption")).toContainText(
    "No API requests",
  );
  expect(lab.hits).toEqual([]);
  expect(comparisonRequests).toEqual([]);
});

test("real GET requests preserve queries and produce the exact field differences", async ({
  page,
  lab,
}, info) => {
  lab.respond(
    "/equipment/1",
    { body: { status: "active", readings: { temperature: 80 } } },
    { body: { state: "active", readings: { temperature: 85 } } },
  );
  await open(page, lab);
  await submit(page, lab, "/equipment/1?view=full&unit=C");
  await expect(page.locator("#result-mode")).toHaveText("LIVE RESULT");
  await expect(page.locator("#result-title")).toHaveText("3 changes found");
  expect(await rows(page)).toEqual([
    ["~ Changed", "/readings/temperature", "80", "85"],
    ["+ Added", "/state", "Not present", '"active"'],
    ["− Removed", "/status", '"active"', "Not present"],
  ]);
  expect(lab.hits).toHaveLength(2);
  expect(lab.hits.map((hit) => hit.side).sort()).toEqual(["base", "target"]);
  for (const hit of lab.hits)
    expect(hit).toMatchObject({
      method: "GET",
      url: "/equipment/1?view=full&unit=C",
      accept: "application/json",
    });
  for (const kind of ["added", "removed", "changed"])
    await expect(page.locator(`#${kind}-count`)).toHaveText("1");
  await info.attach("live-comparison", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("filters show only their category and restore all changes", async ({
  page,
  lab,
}) => {
  lab.respond(
    "/fields",
    { body: { gone: 1, value: 1 } },
    { body: { added: 2, value: 2 } },
  );
  await open(page, lab);
  await submit(page, lab, "/fields");
  for (const [kind, path] of [
    ["added", "/added"],
    ["removed", "/gone"],
    ["changed", "/value"],
  ]) {
    await page.locator(`[data-filter="${kind}"]`).click();
    await expect(page.locator("#diff-body tr")).toHaveCount(1);
    expect((await rows(page))[0]?.[1]).toBe(path);
    await expect(page.locator(`[data-filter="${kind}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#shown-count")).toHaveText(
      "1 of 3 changes shown",
    );
  }
  await page.locator('[data-filter="all"]').click();
  await expect(page.locator("#diff-body tr")).toHaveCount(3);
});

test("key order and JSON formatting do not create false differences", async ({
  page,
  lab,
}) => {
  lab.respond(
    "/equal",
    { raw: '{"id":1,"name":"GT1"}' },
    { raw: '{\n "name": "GT1", "id": 1\n}' },
  );
  await open(page, lab);
  await submit(page, lab, "/equal");
  await expect(page.locator("#result-title")).toHaveText(
    "No differences found",
  );
  await expect(page.locator("#empty-title")).toHaveText("Responses match");
  await expect(page.locator("#diff-body tr")).toHaveCount(0);
  for (const kind of ["added", "removed", "changed"])
    await expect(page.locator(`#${kind}-count`)).toHaveText("0");
});

test("status-only differences count as changes even with equal bodies", async ({
  page,
  lab,
}) => {
  lab.respond(
    "/status",
    { status: 200, body: { ok: true } },
    { status: 201, body: { ok: true } },
  );
  await open(page, lab);
  await submit(page, lab, "/status");
  await expect(page.locator("#result-title")).toHaveText("1 change found");
  await expect(page.locator("#changed-count")).toHaveText("1");
  expect(await rows(page)).toEqual([
    ["~ Changed", "HTTP status", "200", "201"],
  ]);
  await page.locator('[data-filter="removed"]').click();
  await expect(page.locator("#empty-title")).toHaveText(
    "No changes in this category",
  );
  await expect(page.locator("#shown-count")).toHaveText("0 of 1 changes shown");
});

for (const status of [401, 404]) {
  test(`matching HTTP ${status} responses show an error-status warning`, async ({
    page,
    lab,
  }) => {
    lab.respond("/error-status", { status, body: { error: "Request failed" } });
    await open(page, lab);
    await submit(page, lab, "/error-status");
    await expect(page.locator("#result-title")).toHaveText(
      "No differences found",
    );
    await expect(page.locator("#http-warning")).toBeVisible();
    await expect(page.locator("#http-warning")).toContainText(
      `Both APIs returned HTTP ${status}`,
    );
    await expect(page.locator("#http-warning")).toContainText(
      "does not confirm a successful API response",
    );
  });
}

test("HTTP error status and JSON field changes are both shown", async ({
  page,
  lab,
}) => {
  lab.respond(
    "/failure",
    { body: { ok: true } },
    { status: 503, body: { ok: false } },
  );
  await open(page, lab);
  await submit(page, lab, "/failure");
  expect(await rows(page)).toEqual([
    ["~ Changed", "HTTP status", "200", "503"],
    ["~ Changed", "/ok", "true", "false"],
  ]);
  await expect(page.locator("#changed-count")).toHaveText("2");
  await expect(page.locator("#http-warning")).toContainText(
    "At least one API returned an error status",
  );
});

test("missing fields and explicit null values remain distinct", async ({
  page,
  lab,
}) => {
  lab.respond("/null", { body: { removed: null } }, { body: { added: null } });
  await open(page, lab);
  await submit(page, lab, "/null");
  expect(await rows(page)).toEqual([
    ["+ Added", "/added", "Not present", "null"],
    ["− Removed", "/removed", "null", "Not present"],
  ]);
});

test("root JSON values and primitive types are compared", async ({
  page,
  lab,
}) => {
  lab.respond("/root", { raw: "80" }, { raw: '"80"' });
  await open(page, lab);
  await submit(page, lab, "/root");
  expect(await rows(page)).toEqual([["~ Changed", "(root)", "80", '"80"']]);
});

test("top-level null is valid JSON and differs from false", async ({
  page,
  lab,
}) => {
  lab.respond("/null-root", { body: null }, { body: false });
  await open(page, lab);
  await submit(page, lab, "/null-root");
  expect(await rows(page)).toEqual([["~ Changed", "(root)", "null", "false"]]);
});

test("arrays are compared by index including reordered items", async ({
  page,
  lab,
}) => {
  lab.respond(
    "/array",
    { body: [{ id: 1 }, { id: 2 }] },
    { body: [{ id: 2 }, { id: 1 }, null] },
  );
  await open(page, lab);
  await submit(page, lab, "/array");
  expect(await rows(page)).toEqual([
    ["~ Changed", "/0/id", "1", "2"],
    ["~ Changed", "/1/id", "2", "1"],
    ["+ Added", "/2", "Not present", "null"],
  ]);
});

test("HTML-like API keys and values render only as text", async ({
  page,
  lab,
}) => {
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  lab.respond(
    "/escape",
    { body: {} },
    { body: { "<img src=x onerror=alert(1)>": "<script>alert(1)</script>" } },
  );
  await open(page, lab);
  await submit(page, lab, "/escape");
  await expect(page.locator("#diff-body")).toContainText(
    "/<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#diff-body img, #diff-body script")).toHaveCount(
    0,
  );
  expect(dialogs).toEqual([]);
});

test("expanded response JSON and exported live results match the actual APIs", async ({
  page,
  lab,
}) => {
  const reference = { id: 1, nullable: null };
  const target = { id: "1", nullable: null };
  lab.respond("/export", { body: reference }, { body: target });
  await open(page, lab);
  await submit(page, lab, "/export");
  await page.locator("summary").click();
  expect(JSON.parse(await page.locator("#base-body").innerText())).toEqual(
    reference,
  );
  expect(JSON.parse(await page.locator("#target-body").innerText())).toEqual(
    target,
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("api-replay-comparison.json");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toEqual({
    example: false,
    base: { url: `${lab.baseOrigin}/export`, status: 200, body: reference },
    target: { url: `${lab.targetOrigin}/export`, status: 200, body: target },
    matches: false,
    differences: [{ kind: "changed", path: "/id", before: 1, after: "1" }],
  });
});

test("loading disables duplicate submissions and both requests start before either finishes", async ({
  page,
  lab,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  lab.respond("/wait", { body: { ok: true }, wait: gate });
  await open(page, lab);
  await page.locator("#base").fill(lab.baseOrigin);
  await page.locator("#target").fill(lab.targetOrigin);
  await page.locator("#path").fill("/wait");
  try {
    await page.locator("#compare-button").click();
    await expect.poll(() => lab.hits.length).toBe(2);
    await expect(page.locator("#compare-button")).toBeDisabled();
    await expect(page.locator("#compare-button")).toHaveText(/Comparing/);
    await expect(page.locator("#base")).toBeDisabled();
    await expect(page.locator("#example-button")).toBeDisabled();
    await expect(page.locator("#results")).toBeHidden();
  } finally {
    release();
  }
  await expect(page.locator("#compare-button")).toBeEnabled();
  await expect(page.locator("#result-title")).toHaveText(
    "No differences found",
  );
  expect(lab.hits).toHaveLength(2);
});

for (const [name, reply, message] of [
  [
    "invalid JSON",
    { raw: "<html>Not JSON</html>" },
    "did not return valid JSON",
  ],
  ["empty HTTP 204", { status: 204, raw: "" }, "empty bodies are unsupported"],
  ["unfinished response body", { hang: true }, "timed out after 5000 ms"],
] as const) {
  test(`${name} fails visibly without leaving stale results`, async ({
    page,
    lab,
  }) => {
    lab.respond("/bad", { body: {} }, reply);
    await open(page, lab);
    await submit(page, lab, "/bad");
    await expect(page.locator("#error-panel")).toBeVisible();
    await expect(page.locator("#error-message")).toContainText(message);
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#example-button")).toBeEnabled();
    await page.locator("#example-button").click();
    await expect(page.locator("#result-mode")).toHaveText("EXAMPLE");
    await expect(page.locator("#error-panel")).toBeHidden();
  });
}

test("redirects are rejected without requesting their destination", async ({
  page,
  lab,
}) => {
  lab.respond("/redirect", {
    status: 302,
    headers: { location: "/destination" },
    body: {},
  });
  await open(page, lab);
  await submit(page, lab, "/redirect");
  await expect(page.locator("#error-message")).toContainText(
    "HTTP 302 redirect",
  );
  expect(lab.hits.some((hit) => hit.url === "/destination")).toBe(false);
});

test("unreachable target is an error rather than an empty successful comparison", async ({
  page,
  lab,
}) => {
  lab.respond("/unreachable", { body: {} });
  await lab.closeTarget();
  await open(page, lab);
  await submit(page, lab, "/unreachable");
  await expect(page.locator("#error-panel")).toBeVisible();
  await expect(page.locator("#error-message")).toContainText(lab.targetOrigin);
  await expect(page.locator("#results")).toBeHidden();
});

test("invalid origins and off-origin paths are rejected before API requests", async ({
  page,
  lab,
}) => {
  await open(page, lab);
  await page.locator("#base").fill(lab.baseOrigin + "/api");
  await page.locator("#target").fill(lab.targetOrigin);
  await page.locator("#compare-button").click();
  await expect(page.locator("#error-message")).toContainText(
    "must be HTTP(S) origins",
  );
  expect(lab.hits).toEqual([]);
  await submit(page, lab, "//example.com/path");
  await expect(page.locator("#error-message")).toContainText(
    "stay on the supplied origin",
  );
  expect(lab.hits).toEqual([]);
});

test("loading an example resets the form and labels the exported sample", async ({
  page,
  lab,
}) => {
  await open(page, lab);
  await page.locator("#target").fill(lab.targetOrigin);
  await page.locator("#path").fill("/different");
  await page.locator("#example-button").click();
  await expect(page.locator("#target")).toHaveValue("http://127.0.0.1:4011");
  await expect(page.locator("#path")).toHaveValue("/equipment/1");
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("api-replay-example.json");
  expect(
    JSON.parse(await readFile((await download.path())!, "utf8")).example,
  ).toBe(true);
});

test("layout fits the viewport and the diff table can be inspected on small screens", async ({
  page,
  lab,
}) => {
  await open(page, lab);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  await expect(page.locator("#compare-button")).toBeInViewport();
  await page.locator('[data-filter="all"]').click();
  await page.locator(".table-scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(page.locator("thead th").last()).toBeInViewport();
});
