# Testing and intended behavior

The tool's contract is to compare the HTTP status and parsed JSON body of the same GET request in two environments. The CLI, local comparison endpoint and browser display must agree about those observations.

## Run the tests

From the project directory:

```sh
npm ci
npx playwright install chromium
npm run test:all
```

Separate commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Build and run Node.js unit, HTTP integration and behavior-contract tests |
| `npm run test:e2e` | Build, type-check the browser tests, and run desktop/mobile Chromium E2E tests |
| `npm run test:mutations` | Confirm that tests reject four deliberately broken comparison implementations |
| `npx playwright show-report` | Open the most recent HTML browser report |

Browser binaries are a development dependency and are not part of the application runtime. On Linux, `npx playwright install --with-deps chromium` installs the browser and required operating-system libraries; CI uses this command.

## Independent expected behavior

`test/intent.test.ts` uses explicitly defined expected differences, rather than computing the expected output with the function being tested. It covers:

- Missing fields versus explicit `null`, empty strings, booleans and numbers.
- Primitive type changes and root-value changes.
- Ordered arrays, nested indices and array tail removal.
- Object key order, empty containers and parent type changes.
- JSON Pointer escaping, empty property names and Unicode.
- Dynamic timestamps counting as changes until ignore rules exist.
- Input values remaining unchanged by comparison.
- HTTP status differences counting independently from body differences.
- Identical HTTP errors being equal observations, without treating them as a health check.

A deterministic set of 200 generated JSON pairs also checks whether an empty diff agrees with Node's independent deep-equality function. This is a bounded consistency check, not proof for every possible JSON input.

## End-to-end coverage

The Playwright suite launches isolated UI and upstream HTTP servers on dynamically assigned loopback ports. It does not mock the comparison endpoint or reuse an already running app. Requests travel through the actual browser, form handler, local server, HTTP client, diff engine and renderer. Tests inspect exact results and record upstream request methods, paths, query parameters and Accept headers.

The same scenarios run at desktop and mobile Chromium viewport sizes:

- Clearly labeled examples versus actual live comparisons.
- Added, removed, nested and changed values, with exact rows and counts.
- Filters, empty categories, equal responses and status-only differences.
- Matching HTTP 401/404 responses with the required warning, and mismatching error responses.
- Root numbers, strings and `null`; arrays and reordered items.
- HTML-like API content staying text rather than becoming HTML elements.
- Full-response JSON and a downloaded live export matching the actual upstream data.
- Both requests starting before either finishes; controls disabled during the request.
- Invalid JSON, empty HTTP 204 bodies, unavailable APIs and the actual five-second body timeout.
- Redirects being rejected without visiting their destination.
- Invalid origins and off-origin paths being rejected before any upstream request.
- Recovery from errors, sample reset, labeled sample downloads and viewport layout.

Unhandled page errors fail the tests. Successful live-comparison screenshots are attached to the HTML report. Failures retain screenshots and traces. The test runner does not retry failed cases automatically.

## Targeted mutation checks

The mutation script copies compiled files into a new, verified child directory under `work/`, makes one deliberate semantic error per copy, checks that the copy is syntactically valid, and runs the behavior tests against it. A mutation counts as detected only if test assertions fail; a syntax or setup error is not accepted as success.

The four mutations ignore all JSON differences, ignore removals, coerce primitive values to strings, or ignore HTTP status differences. If one survives, the command fails. The temporary copies are removed afterward; application source, compiled app files and running UI assets are never modified by this check. Four targeted mutations are not an exhaustive mutation-testing score.

## Reports and CI

`playwright-report/index.html` contains the browser report. `test-results/e2e-results.json` provides machine-readable results. Both directories are ignored by Git. CI runs unit/HTTP tests on Node.js 22 and 24 on Linux and Windows, and runs browser and mutation checks on Linux with Node.js 24. Browser artifacts are retained for 14 days.

These checks establish the documented behavior for controlled fixtures. They do not establish the correctness of a user's business logic, test protected production APIs, measure load capacity, or cover every browser. Mobile coverage is Chromium viewport/touch emulation, not a real-device test. Authentication headers, ignore rules, recording and non-JSON response support remain future features.

References: [Playwright fixtures](https://playwright.dev/docs/test-fixtures), [assertions](https://playwright.dev/docs/test-assertions), [CI setup](https://playwright.dev/docs/ci-intro).
