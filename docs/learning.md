# Understanding the first working version

The first goal is to send the same GET request to two environments and report how their responses differ. This version does not record traffic: you provide the request path explicitly.

## How the tool works

```text
Read terminal arguments        cli.ts
        ↓
Validate both URLs             compare.ts → requestUrl
        ↓
Send two GET requests          compare.ts → fetchJson
        ↓
Compare JSON values            diff.ts → diffJson
        ↓
Print changes and set an exit code   cli.ts
```

The `--` separator tells npm to pass the following arguments to our program. `--base` identifies the reference environment, `--target` identifies the environment being checked, and `--path` is the endpoint requested from both.

## Reading order

1. `src/demo.ts`: An HTTP server receives a request and returns JSON based on its URL path. The two servers deliberately return different equipment fields.
2. `fetchJson` in `src/compare.ts`: `fetch` waits for the HTTP response, `response.text()` reads its body, and `JSON.parse` converts that text into a JavaScript value. The `JsonValue` TypeScript type describes how our code uses that value; `JSON.parse` is what checks the incoming JSON syntax at runtime.
3. `src/diff.ts`: Equal values need no further work. For objects, compare their keys; for arrays, compare their positions. Nested values call the same function again. This is recursion.
4. `src/cli.ts`: Read arguments, call the comparison function, print the result and set the process exit code.
5. `test/`: Express expectations as code. A removed field must produce a `removed` difference, and an unfinished response must time out.

## Asynchronous requests

`await` waits for an operation that takes time, such as receiving a network response. `Promise.all` starts both requests and waits for both results. If either request fails, the comparison fails.

## First experiments

Follow the README to start the demo and compare `/equipment/1`. You should see three differences.

For each experiment below, stop the demo with Ctrl+C, edit `src/demo.ts`, run `npm run build`, restart `npm run demo`, and repeat the comparison from a second terminal in the project directory.

1. Make the target equipment response identical to the base response. The result should be `MATCH`.
2. Change target `id: 1` to `id: "1"`. Observe that a number and a string are different.
3. Change only `readings.temperature`. The path `/readings/temperature` should identify the changed nested value.
4. Add the same array to both responses, then reorder it in only one response. Observe how comparison by array position works.

Rebuild and restart after editing. An already running server continues using the old code.

## Why exit codes matter

People read terminal output; other programs read exit codes. In PowerShell, run `$LASTEXITCODE` immediately after a comparison:

- `0`: The status codes and JSON bodies match.
- `1`: A difference was found; this can be an expected result.
- `2`: The comparison could not complete, for example because a server is unavailable or a response is not JSON.

If both environments return the same `404` response, the tool reports a match. It compares two observations; it does not prove that an API implements the intended business behavior.

## Check your understanding

- Which parts are the server, client and CLI?
- How does an HTTP status code differ from a JSON response body?
- Why does object key order not matter while array order does?
- How does a missing field differ from a field containing `null`?
- How would you investigate whether a reported difference actually affects API consumers?

The next practical step is authentication support, followed by reading multiple requests from a JSON collection.
