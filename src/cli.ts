import { parseArgs } from "node:util";
import { compareApis } from "./compare.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      target: { type: "string" },
      path: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`API Replay — compare one GET request across two API environments

Usage:
  npm run compare -- --base <origin> --target <origin> --path <path>

Example:
  npm run compare -- --base http://127.0.0.1:4010 --target http://127.0.0.1:4011 --path /equipment/1

Only JSON responses are supported. Timeout: 5 seconds per request.
Arrays are compared by position. Redirects are not followed.
Exit codes: 0 = match, 1 = differences, 2 = usage or request error.`);
    return;
  }

  if (!values.base || !values.target || !values.path) {
    throw new Error("Provide --base, --target and --path. Run with --help for an example.");
  }

  const result = await compareApis(values.base, values.target, values.path);
  console.log(`GET ${values.path}`);
  console.log(`Base:   ${result.base.url} [HTTP ${result.base.status}]`);
  console.log(`Target: ${result.target.url} [HTTP ${result.target.status}]`);

  if (result.base.status !== result.target.status) {
    console.log(`~ HTTP status: ${result.base.status} -> ${result.target.status}`);
  }
  for (const difference of result.differences) {
    const path = difference.path || "(root)";
    if (difference.kind === "added") {
      console.log(`+ ${path}: ${JSON.stringify(difference.after)}`);
    } else if (difference.kind === "removed") {
      console.log(`- ${path}: ${JSON.stringify(difference.before)}`);
    } else {
      console.log(`~ ${path}: ${JSON.stringify(difference.before)} -> ${JSON.stringify(difference.after)}`);
    }
  }
  console.log(result.matches ? "MATCH: status and JSON body are equal." : "DIFFERENT: inspect the changes above.");
  process.exitCode = result.matches ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
