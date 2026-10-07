# AGENTS.md — tds-ext-time-tracker-pkg

Frontend extension for personal time tracking: a running timer, manual entries, a recent
list and a weekly-total widget. It was the first TDS extension and is the worked
reference for `tds-frontend-contract-pkg`. It contributes a PHP `Module` to
`tds-core-frontend-api` and a nav entry, the `/time` route and a widget to the panel
products. Composed at build time.

Read `tds-frontend-contract-pkg/AGENTS.md` first (extension contract).

## Commands

```bash
npm install --no-package-lock   # never npm ci
npm run type-check
npm run lint:primitives
npm run test:run                # vitest
npm run build                   # tsup → dist/
composer install && composer test   # phpunit
```

## Hard rules

- Data is scoped to the authenticated user (`app_user_id` = JWT `userId`). One running timer per user.
- `start` / `stop` / `remove` check their response and report via toast. The manual form's 422 stays in-flow.
- The widget renders `–` on a failed request, never `0 h`.
- Call the API with `apiFetch`, never a relative `fetch`. Never mount a `ToastHost`.
- Every route change updates `php/docs/api.php`. Migration classes are prefixed `TimeTracker`.
- No CSS; shared `tds-shared` classes only. Versions move via the release workflow only.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing routes, the manifest, widgets or islands |
| [docs/agents/backend.md](docs/agents/backend.md) | Touching PHP, migrations or `php/docs/api.php` |
| [docs/agents/frontend-conventions.md](docs/agents/frontend-conventions.md) | Touching any island, page or widget markup |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests |
| [docs/agents/release.md](docs/agents/release.md) | Releasing or changing CI |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
