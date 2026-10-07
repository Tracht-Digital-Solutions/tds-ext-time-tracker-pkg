# Architecture

## Layout

- `src/index.ts` — `defineExtension({...})` default export: nav entry, `/time` route,
  widget, permissions, i18n. Built by tsup to `dist/`; the host imports plain JS from `.`.
  `defineExtension` is `external` (resolved from the host's contract).
- `pages/*.astro` — pages injected via the manifest's `routes` slot. The `/time` page hosts
  the full `TimeTracker` island (timer, manual form, list).
- `widgets/*.astro` — dashboard widget shells. A widget can't be hydrated by string: the
  `.astro` shell renders its React island with `client:load`, and the host renders the
  shell in a loop.
- `islands/*` — React islands (`TimeTracker`, `WeekSummary`).
- No settings section. The old placeholder printed "(Platzhalter)" onto the production
  settings page. Add a `settings` section only together with a real setting.
- `island` / `entrypoint` values are **package subpaths** exposed in `package.json`
  `exports` (`./pages/*`, `./widgets/*`, `./islands/*`), so the host's Vite resolves them
  from `node_modules`.

## Backend

`php/src/TimeTrackerModule.php` with `Domain\TimeEntryRepository`, data via the core
`PDO`, user from the core `UserContext`.

| Route | Purpose |
|---|---|
| `GET /time/summary` | `weekHours` for the current ISO week (Mon → now) plus running state |
| `GET /time/entries` | Recent list, duration computed in SQL |
| `POST /time/start` | Start the timer |
| `POST /time/stop` | Stop the timer |
| `POST /time/entries` | Manual entry; validated `ended_at > started_at` |
| `DELETE /time/entries/{id:[0-9]+}` | Delete an entry |

- Permissions: `time:read` for viewing, `time:write` for changes.
- Every row is scoped to `app_user_id` = the JWT `userId`.
- **A single running timer:** at most one open row (`ended_at IS NULL`) per user.
- Table `time_entry`; migration `CreateTimeTrackerEntry`.

## Outcome handling

- **`start`, `stop` and `remove` must check their response.** A stop that never reached
  the server leaves the timer running against the user's own time; a failed delete makes
  the row reappear on the next load. They report through `toast` (tds-shared `>=0.16.0`).
- The manual form's **422 stays in-flow** as `.tds-alert--danger`. Validation names fields
  the user must still fix, so it must not auto-dismiss.
- Start and stop controls both derive from `summary.running` and are mutually exclusive.
  Rendering both would allow a second timer over a running one.
- The widget distinguishes **failed** from **zero**: `0 h` on a failed request claims the
  user tracked nothing. It must render `–`.

## Motion

From `tds-shared/motion/react` (peer `>=0.38.7`). The entry list is an `AnimatedList`: a
stopped timer, a manual entry and a delete fade the row in or out, and the rest move up.
A comment in expression position (`) : (`) must be `//`, not `{/* */}`; the parse error
only shows in the test run.
