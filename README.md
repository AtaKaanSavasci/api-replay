# API Replay

Compare the HTTP status and JSON body of the same GET request across two API environments.

Version **0.1.0** is a small TypeScript CLI. Define the request with command-line arguments; traffic recording and request collections are future work.

Use it after a backend change to see which response fields were added, removed or changed. Review those observations alongside your tests; a difference alone does not prove that a change breaks clients.

## Quick start

Requires Node.js 22 or newer and npm. Open a terminal in the project directory before running npm commands.

```sh
git clone https://github.com/AtaKaanSavasci/api-replay.git
cd api-replay
```

```sh
npm ci
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

`npm test` compiles TypeScript and runs unit and local HTTP integration tests using Node's test runner. Rebuild after changing source files before running `compare` or `demo` directly. There are no production package dependencies.

```text
src/cli.ts      Arguments, terminal output, exit codes
src/compare.ts  URLs, HTTP requests, response comparison
src/diff.ts     Recursive JSON comparison; no network or terminal access
src/demo.ts     Two small local API servers
test/          Comparison and CLI integration tests
docs/learning.md           Walkthrough and exercises
docs/real-api-comparison.md Real API comparison plan and limitations
```

## Next milestones

1. Support authentication headers for protected APIs.
2. Read multiple requests from a JSON collection.
3. Ignore explicitly selected dynamic fields.
4. Export a readable HTML report.
5. Run API comparisons in CI against controlled environments.

Repository CI runs the tool's own tests on Linux and Windows. Comparing a user's API in CI is a separate future feature.

## References

Implementation references: [Node.js fetch and AbortSignal](https://nodejs.org/api/globals.html), [Node.js test runner](https://nodejs.org/api/test.html), [TypeScript strict checking](https://www.typescriptlang.org/tsconfig/strict.html).
