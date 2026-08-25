# AGENTS.md — ext-time-tracker

The first TDS frontend **extension** and the reference for `frontend-contract`. Read
`frontend-contract`'s AGENTS.md first — this repo just implements that contract.

## Shape

- `src/index.ts` — `defineExtension({...})` default export (the manifest).
- `pages/*.astro` — pages injected via the manifest's `routes` slot.
- `widgets/*.astro` — dashboard widget shells (server component + embedded
  hydrated React island). Referenced by the `widgets` slot's `island`.
- `islands/*` — React islands + settings shells.
- `php/src/TimeTrackerModule.php` — the backend `Module`.
- `php/db/migrations/*` — Phinx migrations, class names **prefixed `TimeTracker`**.
- `php/docs/api.php` — the route documentation the admin frontend's API
  reference renders (`ApiDocSource`, see below).

## Gotchas

- **Call the API with `apiFetch` from `@tracht-digital-solutions/tds-shared/api`,
  never a relative `fetch`.** Every island used to define its own
  `const api = (path, init) => fetch(path, { credentials: "include", ...init })`
  with a RELATIVE path. In a product that resolves against the product's own
  static host (`management.`/`app.tracht-digital.de`), not the API — and the
  static host answers unknown paths with its SPA fallback, i.e. **200 + HTML**.
  So `res.ok` is `true`, `res.json()` throws, and the usual
  `.catch(() => setRows([]))` renders a calm, permanent empty state with no
  error and no console warning. `apiFetch` resolves the base from
  `<meta name="tds-api-base">` (written by the frontend host) and routes 401s
  through the host's confirm-against-`/me` backstop, which extension calls
  previously skipped entirely.
  The island tests match on the request PATH (`pathOf()`), which a relative
  fetch satisfies just as well — so one assertion per suite pins the **absolute
  host**. That is the line that fails if this ever regresses.


- **`island` / `entrypoint` are package subpaths, not local paths.** They must be
  exposed in `package.json` `exports` (`./pages/*`, `./widgets/*`, `./islands/*`)
  so the host's Astro/Vite resolves them from `node_modules`.
- **The manifest is built (tsup) to `dist/`.** The host imports plain JS from
  `.`; `defineExtension` is `external` (resolved from the host's frontend-contract).
- **Widgets can't be hydrated by string.** A widget is an `.astro` shell that
  internally renders its React island with `client:load`; the host renders the
  shell in a loop (see `frontend-contract` astro.ts).
- **Migration class names must be globally unique** across all modules — always
  prefix with `TimeTracker`.
- **`start` / `stop` / `remove` must check their response** — they used to
  `await` and discard it, which is worse here than a missing confirmation: a
  stop that never reached the server leaves the timer running against the
  user's own time, and a failed delete makes the row reappear on the next load
  with no reason given. They report through `toast` from tds-shared
  (`>=0.16.0`); the extension mounts no `ToastHost` (the host owns the one).
  The manual form's **422 stays in-flow** (`.tds-alert--danger`, previously the
  info hue): validation points at fields the user must still fix and must not
  auto-dismiss, unlike a transient outcome.
- Depends on the **published** `tds-frontend-contract` (`^0.2.0`): npm from GitHub
  Packages (`.npmrc` + `NPM_TOKEN`), Composer from the public VCS repo. **No local
  path repo** — Composer fatals on a missing path repo in CI. Same dual pipeline as
  `tds-ext-template-pkg` (annotated release tag; `npm install --no-package-lock`).

- **The route docs are asserted against the routes, both ways.** This module
  implements the contract's optional `ApiDocSource`: `php/docs/api.php` returns
  one entry per route (summary, params, responses, required permission) and the
  admin frontend's API reference joins it onto the introspected Slim routes by
  `"<METHOD> <pattern>"`. Two consequences worth knowing:
  - `pattern` must be the Slim pattern **verbatim**, inline regex included
    (`/time/entries/{id:[0-9]+}`). A prettified path silently produces an
    orphan doc *and* an undocumented route rather than an error.
  - `php/tests/TimeTrackerApiDocsTest.php` asserts the documented set and the
    registered set are the same set. Adding or renaming a route without
    touching `docs/api.php` fails here — which is the point: a reference full
    of confident, wrong detail is worse than the bare route list it replaced.

## Checkpoint status

- **CP1 (reference smoke):** manifest with all six slots + placeholder
  `/time/summary` proved end-to-end composition.
- **CP2 (real time tracking):** `Domain\TimeEntryRepository` + a real module —
  scoped to the authenticated user (`app_user_id` = JWT `userId`, via the core
  `UserContext`; data via the core PDO). A single running timer (`POST /time/start`
  / `/time/stop`, one open `ended_at IS NULL` row per user), manual entries
  (`POST /time/entries`, validated `ended_at > started_at`), a recent list
  (`GET /time/entries`, SQL-computed duration), delete, and the widget's real
  weekly total (`GET /time/summary` → `weekHours` + running state, current ISO
  week Mon→now). New `time:write` permission (viewing stays `time:read`). Frontend:
  the `WeekSummary` widget fetches the real summary; the `/time` page hosts the full
  `TimeTracker` island (timer + manual form + list). phpunit 4/4 (RBAC/validation
  short-circuit before the repo; DB-backed paths skip without a DB). Added `php-di`
  dev dep for the test container.

## Commands

```bash
npm run build && npm run type-check
npm run test:run                    # vitest (69 tests)
composer install && composer test   # (no PHP tests yet)
```

## Tests
- **CI runs `test:run` since 2026-08-25 — before that, none of these suites
  ever ran on a runner.** `_build.yml` had type-check, lint:primitives and
  build. That included the `ApiDocSource` parity test, whose entire job is to
  fail when a route gains or loses documentation.
- **The suites used to run against a tds-shared a dozen minors old, and the
  first honest run cost 30 failures across the twelve shipping extensions.**
  This package declares tds-shared as a **peer** with a `>=0.19.0` floor, so a
  fresh install resolved 0.19.0 while every product build composes the current
  one. Three separate behaviours had moved underneath the tests, and each is
  worth knowing because a new suite will hit them again:
  - `apiFetch` consults the host-side runtime config (`/tds-runtime.json`)
    before it resolves a URL, so `fetch.mock.calls[0]` is that probe, not the
    endpoint. Call **`primeRuntimeConfig(null)`** in `beforeEach` — the panel
    products never ship that file (they render `<meta name="tds-api-base">`),
    so "absent" is also what happens in production.
  - `apiFetch` is **async**: the request leaves on a later microtask than the
    render. Reading `mock.calls` on the line after `render(...)` yields
    `undefined`; `await waitFor(() => expect(fetch).toHaveBeenCalled())` first.
  - A multipart upload now carries an **empty** `headers` object rather than
    `undefined`. Identical to the browser — the boundary is still the
    browser's to set — so assert "no content-type header", never
    "headers is undefined".


`npm run test:run` (vitest; jsdom per-file via a `@vitest-environment` docblock).

- `islands/TimeTracker.test.tsx` — the timer, manual entries and the list. The
  start and stop controls are mutually exclusive by construction (both derive
  from `summary.running`); rendering both would let a user start a second timer
  over a running one, so that is pinned. `fmt()` is covered at its boundaries
  (0m, 45m, 2h 0m, 1h 30m) — the `2h 0m` case is the one that catches a "drop
  the minutes when they are zero" regression.
- `islands/WeekSummary.test.tsx` — the widget's three states. The distinction
  between **failed** and **zero** is the point: rendering `0 h` on a failed
  request asserts the user tracked nothing this week, which is a different and
  wrong claim. It must render `–`.

Error-path tests deliberately return a POPULATED body with their non-OK status.
Against an empty error body, `r.ok ? r.json() : { entries: [] }` and a bare
`r.json()` end up identical, so the test would pass with the ok-check deleted.

Verified by mutation: 16 deliberate breakages introduced, 16 caught.

`composer test` (phpunit) additionally covers the backend Module:
`php/tests/TimeTrackerModuleTest.php` (routes + RBAC) and
`php/tests/TimeTrackerApiDocsTest.php` (route ↔ documentation parity).

## After a change

Bump `version` in `package.json` + `composer.json` (lockstep), update this file +
README, commit together.

## Mobile layout

This package ships **no CSS**, so every layout decision is a shared class or a
Tailwind utility, and neither is checked by anything at runtime. Two rules:

- **A row of more than two things — or any row holding a full-width field —
  goes on `.tds-row`, `.tds-list__row` or `.tds-toolbar`.** All three wrap.
  A hand-rolled `flex` does not, and on a 375px screen the overflow is not
  even visible: `body { overflow-x: hidden }` clips it, so the content simply
  is not there.
- **A `<table>` needs `tds-table` and nothing else.** The primitive turns
  itself into a horizontal scroller below 40rem; an extra `overflow-x`
  wrapper or an inline style is redundant. A table with no focusable cell
  also needs `tabindex="0"` + `role="region"` + a label, or its scrollport
  cannot be reached by keyboard.

`npm run lint:primitives` enforces the class part of this (including a
`<table>` without `tds-table` and a flex/grid table cell, which silently
drops the cell out of the column algorithm). It is a **regex scan**, so a tag
name written inside a comment counts as markup — name elements in prose.
