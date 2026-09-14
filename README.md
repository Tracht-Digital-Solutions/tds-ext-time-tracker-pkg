# ext-time-tracker

Time-tracker **extension** for the TDS frontend platform, and the **reference
implementation** of `frontend-contract`. Two halves in one repo, like the contract:

- **Frontend** (`@tracht-digital-solutions/tds-ext-time-tracker`, GitHub Packages) —
  a default-exported `ExtensionManifest` (`src/index.ts`) plus the `.astro` pages
  / widgets and the React islands they hydrate (`pages/`, `widgets/`,
  `islands/`). Contributes: the `/time` page, the "Diese Woche" dashboard widget,
  a nav entry, the `time:read` permission and DE/EN i18n. No settings section —
  there is nothing to set yet, and `tds-ext-template-pkg` shows that slot.
- **Backend** (`tracht-digital-solutions/tds-ext-time-tracker`, Composer) — a
  `TimeTrackerModule` (`php/src/`) mounting `/time/*` (incl. the widget's
  `/time/summary` dataEndpoint) + its Phinx migrations (`php/db/migrations`,
  class names prefixed `TimeTracker*`).

## How it plugs in

The product host enables it in `astro.config.mjs`:

```ts
import { frontendHost } from "@tracht-digital-solutions/tds-frontend-contract/astro";
import timeTracker from "@tracht-digital-solutions/tds-ext-time-tracker";
export default defineConfig({ integrations: [react(), frontendHost({ extensions: [timeTracker] })] });
```

The base API adds `new TimeTrackerModule()` to its `ModuleRegistry`.

## Develop

```bash
npm install        # pulls tds-frontend-contract from GitHub Packages (needs NPM_TOKEN)
npm run build      # tsup → dist/ (the manifest the host imports)
npm run type-check
composer install   # resolves tds-frontend-contract from its public VCS repo
```

The manifest's `island` / route `entrypoint` values are package subpaths
(exposed via `exports`), which the host's Astro/Vite resolves — not local files.

## Status

Real and complete (v0.1.x). The `/time` page is a full tracker island — a single
running timer (`POST /time/start` / `/stop`, one open row per user), manual entries
(validated `ended_at > started_at`), a recent-entries list with computed durations, and
a real weekly total (`GET /time/summary` → `weekHours` + running, ISO week Mon→now). All
scoped to the authenticated user via the core `UserContext`; data via the core `PDO`.
Permissions: `time:read` (view) / `time:write` (mutate).
