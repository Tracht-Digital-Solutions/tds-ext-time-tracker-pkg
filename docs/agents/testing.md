# Testing

```bash
npm run test:run   # vitest; islands opt into jsdom per file via a @vitest-environment docblock
composer test      # phpunit
```

CI (`_build.yml`) runs both suites, plus type-check, `lint:primitives` and build, on
every run.

## Test environment against the current tds-shared

tds-shared is a **peer** dependency, so a fresh standalone install may resolve an old
version while every product build composes the current one. Keep these in mind:

- `apiFetch` first consults the host runtime config (`/tds-runtime.json`), so
  `fetch.mock.calls[0]` is that probe. Call **`primeRuntimeConfig(null)`** in
  `beforeEach`; panel products never ship that file, so "absent" matches production.
- `apiFetch` is **async**. `await waitFor(() => expect(fetch).toHaveBeenCalled())`
  before reading `mock.calls`.
- A multipart upload carries an **empty** `headers` object. Assert "no content-type
  header", never "headers is undefined".
- Error-path tests answer with a **populated** body and a non-OK status. Against an
  empty error body the ok-check is unobservable.
- At least one assertion per suite pins the **absolute API host** (see
  [frontend-conventions.md](frontend-conventions.md#api-calls-apifetch-never-a-relative-fetch)).

## Suites

| Suite | Sharpest assertions |
|---|---|
| `islands/TimeTracker.test.tsx` | Start and stop are mutually exclusive; `fmt()` at its boundaries (0m, 45m, 2h 0m, 1h 30m). `2h 0m` catches a "drop zero minutes" regression. |
| `islands/WeekSummary.test.tsx` | Three states; **failed** renders `–`, never `0 h`. |
| `tests/packaging.test.ts` | Every specifier resolves, is exported and ships. |
| `php/tests/TimeTrackerModuleTest.php` | Routes and RBAC; validation short-circuits before the repository. DB-backed paths skip without a DB. |
| `php/tests/TimeTrackerApiDocsTest.php` | Route ↔ documentation parity. |

Error-path tests return a populated body with their non-OK status. Against an empty body,
`r.ok ? r.json() : { entries: [] }` and a bare `r.json()` behave the same, so the test
would pass with the ok-check deleted.

Mutation check: 16 breakages, 16 caught.
