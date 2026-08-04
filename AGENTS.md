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

## Gotchas

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

## After a change

Bump `version` in `package.json` + `composer.json` (lockstep), update this file +
README, commit together.
