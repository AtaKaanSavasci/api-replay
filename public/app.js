const $ = (id) => document.getElementById(id);
const form = $("compare-form");
let comparison = null;
let differences = [];
let filter = "all";
let isExample = true;
let busy = false;

function setBusy(value) {
  busy = value;
  for (const control of [
    ...form.elements,
    $("example-button"),
    $("export-button"),
  ])
    control.disabled = value;
  form.setAttribute("aria-busy", String(value));
  $("compare-label").textContent = value ? "Comparing…" : "Compare responses";
}

function clearError() {
  $("error-panel").hidden = true;
}

function showError(error) {
  $("results").hidden = true;
  $("error-message").textContent =
    error instanceof Error ? error.message : String(error);
  $("error-panel").hidden = false;
  $("live-status").textContent =
    "Comparison failed. " + $("error-message").textContent;
}

async function readResult(response) {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Could not complete the comparison.");
  return body;
}

function cellText(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function valueCell(value, present, className) {
  const cell = document.createElement("td");
  cell.append(
    cellText(
      present ? "pre" : "span",
      present ? `cell-value ${className}` : "missing-value",
      present ? JSON.stringify(value, null, 2) : "Not present",
    ),
  );
  return cell;
}

function renderDifferences() {
  const visible = differences.filter(
    (item) => filter === "all" || item.kind === filter,
  );
  const rows = visible.map((item) => {
    const row = document.createElement("tr");
    const badge = document.createElement("td");
    const labels = {
      added: "+ Added",
      removed: "− Removed",
      changed: "~ Changed",
    };
    badge.append(
      cellText("span", `change-tag ${item.kind}`, labels[item.kind]),
    );
    const path = document.createElement("td");
    path.append(cellText("code", "field-path", item.path || "(root)"));
    row.append(
      badge,
      path,
      valueCell(
        item.before,
        item.kind !== "added",
        item.kind === "removed" ? "old-value" : "",
      ),
      valueCell(
        item.after,
        item.kind !== "removed",
        item.kind !== "removed" ? "new-value" : "",
      ),
    );
    return row;
  });
  $("diff-body").replaceChildren(...rows);
  $("empty-state").hidden = visible.length !== 0;
  if (!visible.length) {
    const match = comparison.matches;
    $("empty-symbol").textContent = match ? "✓" : "—";
    $("empty-title").textContent = match
      ? "Responses match"
      : "No changes in this category";
    $("empty-description").textContent = match
      ? "The HTTP status and JSON body are identical."
      : "Choose another filter to inspect the remaining differences.";
  }
  $("shown-count").textContent =
    `${visible.length} of ${differences.length} changes shown`;
  for (const button of document.querySelectorAll("[data-filter]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === filter),
    );
  }
}

function renderResult(result, example) {
  comparison = result;
  isExample = example;
  filter = "all";
  differences = [...result.differences];
  if (result.base.status !== result.target.status) {
    differences.unshift({
      kind: "changed",
      path: "HTTP status",
      before: result.base.status,
      after: result.target.status,
    });
  }
  const count = differences.length;
  $("result-title").textContent = result.matches
    ? "No differences found"
    : `${count} ${count === 1 ? "change" : "changes"} found`;
  $("result-mode").textContent = example ? "EXAMPLE" : "LIVE RESULT";
  $("result-mode").classList.toggle("live", !example);
  $("result-caption").textContent = example
    ? "Built-in sample. No API requests are made for this example."
    : `GET ${new URL(result.base.url).pathname}${new URL(result.base.url).search} · Reference → target`;
  for (const kind of ["added", "removed", "changed"]) {
    $(kind + "-count").textContent = String(
      differences.filter((item) => item.kind === kind).length,
    );
  }
  $("all-count").textContent = String(count);
  for (const side of ["base", "target"]) {
    $(side + "-status").textContent = String(result[side].status);
    $(side + "-status").classList.toggle("error", result[side].status >= 400);
    $(side + "-url").textContent = result[side].url;
    $(side + "-body").textContent = JSON.stringify(result[side].body, null, 2);
  }
  const hasErrorStatus =
    result.base.status >= 400 || result.target.status >= 400;
  $("http-warning").hidden = !hasErrorStatus;
  $("http-warning").textContent = result.matches
    ? `Both APIs returned HTTP ${result.base.status}. Their error responses match; this does not confirm a successful API response.`
    : "At least one API returned an error status. Review the status codes as well as the JSON changes.";
  $("results").hidden = false;
  renderDifferences();
  $("live-status").textContent =
    `${example ? "Example loaded. " : "Comparison complete. "}${$("result-title").textContent}.`;
}

async function loadExample() {
  if (busy) return;
  clearError();
  setBusy(true);
  $("results").hidden = true;
  try {
    const result = await readResult(await fetch("/api/example"));
    const baseUrl = new URL(result.base.url);
    $("base").value = baseUrl.origin;
    $("target").value = new URL(result.target.url).origin;
    $("path").value = baseUrl.pathname + baseUrl.search;
    renderResult(result, true);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const input = Object.fromEntries(new FormData(form));
  for (const key of ["base", "target", "path"]) input[key] = input[key].trim();
  clearError();
  $("results").hidden = true;
  setBusy(true);
  $("live-status").textContent =
    "Sending the GET request to both environments.";
  try {
    const response = await fetch("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    renderResult(await readResult(response), false);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
});

$("example-button").addEventListener("click", loadExample);
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    renderDifferences();
  });
}
$("export-button").addEventListener("click", () => {
  if (!comparison) return;
  const blob = new Blob(
    [JSON.stringify({ example: isExample, ...comparison }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = isExample
    ? "api-replay-example.json"
    : "api-replay-comparison.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

loadExample();
