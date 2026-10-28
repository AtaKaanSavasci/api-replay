import { diffJson, type Difference, type JsonValue } from "./diff.js";

export interface Snapshot {
  url: string;
  status: number;
  body: JsonValue;
}

export interface Comparison {
  base: Snapshot;
  target: Snapshot;
  differences: Difference[];
  matches: boolean;
}

export function requestUrl(origin: string, path: string): URL {
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol)
      || base.username || base.password
      || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Base and target must be HTTP(S) origins, e.g. http://localhost:3000");
  }
  const url = new URL(path, base);
  if (!path.startsWith("/") || path.startsWith("//")
      || url.origin !== base.origin || url.hash) {
    throw new Error("Path must start with / and stay on the supplied origin; fragments are not supported");
  }
  return url;
}

export async function fetchJson(url: URL, timeoutMs = 5000): Promise<Snapshot> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal,
    });
    text = await response.text();
  } catch (error) {
    const reason = signal.aborted
      ? `request timed out after ${timeoutMs} ms`
      : error instanceof Error ? error.message : String(error);
    throw new Error(`${url.href}: ${reason}`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${url.href}: HTTP ${response.status} redirect; use the final endpoint directly`);
  }
  let body: JsonValue;
  try {
    body = JSON.parse(text) as JsonValue;
  } catch {
    throw new Error(`${url.href}: HTTP ${response.status} did not return valid JSON (empty bodies are unsupported)`);
  }
  return { url: url.href, status: response.status, body };
}

export async function compareApis(base: string, target: string, path: string): Promise<Comparison> {
  // Validate both URLs before sending either request.
  const baseUrl = requestUrl(base, path);
  const targetUrl = requestUrl(target, path);
  const [baseResult, targetResult] = await Promise.all([
    fetchJson(baseUrl), fetchJson(targetUrl),
  ]);
  return compareSnapshots(baseResult, targetResult);
}

export function compareSnapshots(base: Snapshot, target: Snapshot): Comparison {
  const differences = diffJson(base.body, target.body);
  return {
    base,
    target,
    differences,
    matches: base.status === target.status && differences.length === 0,
  };
}
