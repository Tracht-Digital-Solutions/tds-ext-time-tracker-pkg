import { defineExtension } from "@tracht-digital-solutions/tds-frontend-contract";

/**
 * Time-tracker extension — the first extension, and the reference for the
 * contract. It contributes a page (`/time`), a dashboard widget ("Diese
 * Woche"), a nav entry, a permission, and i18n strings. No settings section:
 * the one it had only printed a placeholder onto the production settings page,
 * and `tds-ext-template-pkg` already demonstrates that slot.
 *
 * `island` / `entrypoint` are package subpaths the host's Astro/Vite resolves
 * (see this package's `exports`). The widget entrypoint is an `.astro` shell
 * that embeds a hydrated React island, proving both server render + client
 * hydration flow through the contract.
 */
export default defineExtension({
  id: "time-tracker",
  name: "Zeiterfassung",
  version: "0.1.0",
  permissions: [
    { id: "time:read", label: "Zeiten ansehen", group: "time-tracker" },
    { id: "time:write", label: "Zeiten erfassen", group: "time-tracker" },
  ],
  nav: [
    {
      id: "time",
      label: "Zeiterfassung",
      href: "/time",
      icon: "clock",
      group: "work",
      order: 20,
      permission: "time:read",
    },
  ],
  widgets: [
    {
      id: "time-week",
      title: "Diese Woche",
      island: "@tracht-digital-solutions/tds-ext-time-tracker/widgets/Week.astro",
      size: "md",
      permission: "time:read",
      dataEndpoint: "/time/summary",
      order: 10,
    },
  ],
  routes: [
    {
      pattern: "/time",
      entrypoint: "@tracht-digital-solutions/tds-ext-time-tracker/pages/Index.astro",
      permission: "time:read",
    },
  ],
  i18n: {
    de: { "time.title": "Zeiterfassung", "time.week": "Diese Woche" },
    en: { "time.title": "Time tracking", "time.week": "This week" },
  },
});
