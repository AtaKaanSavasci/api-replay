# API Replay

Compare the HTTP status and JSON body of the same GET request across two API environments.

A small TypeScript tool with a local browser interface and a CLI. Compare one GET request at a time; traffic recording and request collections are future work.

Use it after a backend change to see which response fields were added, removed or changed. Review those observations alongside your tests; a difference alone does not prove that a change breaks clients.

## Quick start

Requires Node.js 22 or newer and npm. Open a terminal in the project directory before running npm commands.

```sh
git clone https://github.com/AtaKaanSavasci/api-replay.git
cd api-replay
```

```sh
npm ci
npm run ui
```

Open **http://127.0.0.1:4173**. A clearly labeled built-in example shows added, removed and changed fields without starting any API servers. Enter your own API origins and endpoint path, then select **Compare responses** for a live comparison.

- Green **+ Added**: fields present only in the target.
- Red **− Removed**: fields missing from the target.
- Amber **~ Changed**: values or HTTP status codes that differ.
- Filter changes, expand full JSON responses, or export the comparison as JSON. Exported examples are labeled `"example": true`.

The UI runs locally, binds to `127.0.0.1` and sends no comparison data to an external service other than the API origins you enter. The local Node.js server makes those API requests. Authentication headers are not supported yet.

To try a live comparison with the included demo APIs, keep the UI terminal open and run this in a second terminal **from the project directory**:

```sh
npm run demo
```

The default form values point to these demo servers. Compare `/equipment/1` for differences or `/health` for a match. Stop each server with Ctrl+C.

If port 4173 is in use, set `UI_PORT` before starting the UI. In PowerShell:

```powershell
$env:UI_PORT = '4174'
npm run ui
```

## Terminal usage

For the CLI, build the project and start the demo APIs:

```sh
npm run build
npm run demo
```

Keep that terminal open. In a second terminal, from this project directory:

```sh
npm run compare -- --base http://127.0.0.1:4010 --target http://127.0.0.1:4011 --path /equipment/1
```

The demo binds to local ports 4010 and 4011. Stop it with Ctrl+C.

```text
GET /equipment/1
Base:   http://127.0.0.1:4010/equipment/1 [HTTP 200]
Target: http://127.0.0.1:4011/equipment/1 [HTTP 200]
~ /readings/temperature: 80 -> 85
+ /state: "active"
- /status: "active"
DIFFERENT: inspect the changes above.
```

This intentionally returns exit code **1** because the responses differ. Try `--path /health` for a match and exit code **0**.

## Your own API

```sh
npm run compare -- --base http://localhost:3000 --target http://localhost:3001 --path "/equipment/1?view=full"
```

- `--base` and `--target` are origins (protocol, hostname and optional port). Put the full endpoint path in `--path`, including any `/api` prefix.
- Query parameters are supported. Quote paths containing shell metacharacters such as `&`.
- Timeout is five seconds per request, including reading the body. Both requests start concurrently.
- The CLI sends GET requests with `Accept: application/json` and does not follow redirects.
- Responses must contain valid JSON; empty bodies, including HTTP 204, are unsupported in this milestone.
- JSON error bodies (such as HTTP 404) are compared too. Matching responses do not imply a healthy API.
- Authentication headers are not supported yet. Use public endpoints or controlled local fixtures for this milestone. Two matching `401` responses do not test the protected data behind them.

For a fair comparison, run the two API versions against equivalent fixed test data and keep that data unchanged while comparing. See [Comparing a real API](docs/real-api-comparison.md) for the setup and current limitations.

## Comparison rules

- Object key order does not matter. Added, removed and changed fields are reported recursively.
- Arrays are compared by position; reordering is a difference.
- Types matter: `80` and `"80"` differ. A missing field differs from a field containing `null`.
- Paths use JSON Pointer notation: `/readings/temperature`. Within a key, `~` becomes `~0` and `/` becomes `~1`. `(root)` means the whole JSON value.
- All fields count, including timestamps and generated IDs. Ignore rules are planned.
- Status codes count; headers, response timing and raw JSON whitespace do not.
- A difference is an observation, not an automatic verdict that a change breaks clients.

| Exit code | Meaning |
| --- | --- |
| 0 | Status and JSON body match |
| 1 | Status or JSON body differs |
| 2 | Invalid arguments, network failure, timeout or unsupported response |

## Development

```sh
npm test
npm run compare -- --help
```

`npm test` compiles TypeScript and runs unit, behavior-contract and local HTTP integration tests using Node's test runner. Rebuild after changing source files before running `compare` or `demo` directly. There are no production package dependencies.

Install the test browser once, then run the complete browser and behavior checks:

```sh
npx playwright install chromium
npm run test:all
```

`npm run test:e2e` tests the complete UI against real local HTTP fixtures in desktop and mobile Chromium viewports. Each test starts its own servers on available ports, so no demo servers or live accounts are needed. `npm run test:mutations` verifies that behavior tests reject four deliberately broken copies of the comparison engine. These copies never replace the application code.

Open the detailed browser report with `npx playwright show-report`. See [Testing and intended behavior](docs/testing.md) for the contract, coverage and limitations.

```text
src/cli.ts      Arguments, terminal output, exit codes
src/compare.ts  URLs, HTTP requests, response comparison
src/diff.ts     Recursive JSON comparison; no network or terminal access
src/demo.ts     Two small local API servers
src/ui.ts       Local browser interface entry point
src/ui-server.ts Local HTTP server and comparison endpoints
public/        Browser HTML, CSS and JavaScript
test/          Comparison and CLI integration tests
e2e/           Browser end-to-end tests and isolated HTTP fixtures
scripts/       Targeted mutation checks
docs/learning.md           Walkthrough and exercises
docs/real-api-comparison.md Real API comparison plan and limitations
```

## Next milestones

1. Support authentication headers for protected APIs.
2. Read multiple requests from a JSON collection.
3. Ignore explicitly selected dynamic fields.
4. Export a readable HTML report.
5. Run API comparisons in CI against controlled environments.

Repository CI runs unit/HTTP tests on Linux and Windows, plus browser E2E and targeted mutation checks on Linux. Browser reports are saved as CI artifacts. Comparing a user's API in CI is a separate future feature.

## References

Implementation references: [Node.js fetch and AbortSignal](https://nodejs.org/api/globals.html), [Node.js test runner](https://nodejs.org/api/test.html), [TypeScript strict checking](https://www.typescriptlang.org/tsconfig/strict.html).
