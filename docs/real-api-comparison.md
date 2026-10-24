# Comparing a real API

A meaningful comparison needs two running API versions, the same request, equivalent fixed data and the same user permissions.

## Comparison workflow

1. Choose a reference commit and the changed commit. Documentation-only changes are unlikely to produce API response differences.
2. Check out each version in a separate directory. Keep the current development checkout intact.
3. Install each version's locked dependencies and build it using that project's setup instructions.
4. Run the reference on one local port and the target on another. The application must support distinct ports; changing the CLI's URLs does not change where the servers listen.
5. Seed separate test databases with equivalent synthetic data, including fixed IDs and timestamps. Do not change the data while comparing. Avoid database migrations from one version affecting the other version's database.
6. Use an endpoint supported by both versions and compare the responses.

For an unauthenticated JSON endpoint, once the servers are running on ports 3000 and 3001:

```sh
npm run compare -- --base http://localhost:3000 --target http://localhost:3001 --path /your-endpoint
```

Run that command from the API Replay project directory, not from either API application's directory. Replace `/your-endpoint` with an actual JSON endpoint.

## First checks

Start with identical code and fixed data in both environments. Expect a match. Then make one deliberate change in the target, such as renaming a response field. Expect that exact difference. Finally, compare a genuine backend change and review the differences against the intended behavior.

Dynamic timestamps, random IDs and differently ordered query results can create differences without a code regression. Version 0.1.0 reports all such differences; it has no ignore rules or array matching by ID.

## Applying this to Shift Handover System

Inspection of [Shift Handover System at commit 460817a](https://github.com/AtaKaanSavasci/shift-handover-system/tree/460817aa30672410c836bf598d445dd52d65dbc0) shows two prerequisites:

- `src/index.ts` listens on the fixed port 3000. To run two copies on the same host, first make the application accept a configurable port, or map distinct host ports using containers.
- Data endpoints such as `GET /shifts`, `GET /shifts/current` and the `/operations` routes require authentication. API Replay 0.1.0 cannot send bearer tokens yet. Comparing matching authentication errors would not compare the actual shift or equipment data.

The next tool feature should therefore support request headers, with credentials supplied through environment variables. Each environment may need its own token, representing users with equivalent permissions. After that, use equivalent synthetic shift data and a verified protected JSON endpoint for the first real comparison.

This document is a setup plan. A comparison of two running Shift Handover versions has not been performed yet.
