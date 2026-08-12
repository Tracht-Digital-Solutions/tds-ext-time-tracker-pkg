// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeTracker from "./TimeTracker";
import { TOAST_EVENT } from "@tracht-digital-solutions/tds-shared/toast";

/**
 * The time-tracker page: start/stop timer, manual entry, recent list.
 *
 * The timer's mode is derived from `summary.running`, so the two states are
 * mutually exclusive by construction — the tests pin that, because rendering
 * both would let a user start a second timer over a running one.
 */

type Hit = { status?: number; body?: unknown };
let handlers: Array<(url: string, init?: RequestInit) => Hit | undefined> = [];
let calls: Array<{ url: string; method: string; body: unknown }> = [];


/**
 * Path + query of a request. The island calls an ABSOLUTE URL now (via
 * `apiFetch`); a relative one would hit the product's own static host and come
 * back as SPA-fallback HTML with a 200. Matching on the path keeps the route
 * matchers below anchored.
 */
const pathOf = (url: string) => String(url).replace(/^https?:\/\/[^/]+/i, "");

function respond(match: RegExp, body: unknown, status = 200, method?: string) {
  handlers.unshift((url, init) => {
    if (!match.test(pathOf(url))) return undefined;
    if (method && (init?.method ?? "GET") !== method) return undefined;
    return { status, body };
  });
}

/** Outcomes are toasts now, so they are collected off the `tds:toast` bus. */
let toasts: Array<{ variant: string; message: string }> = [];
const collectToast = (e: Event) => {
  toasts.push((e as CustomEvent<{ variant: string; message: string }>).detail);
};

beforeEach(() => {
  handlers = [];
  calls = [];
  toasts = [];
  window.addEventListener(TOAST_EVENT, collectToast);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      for (const h of handlers) {
        const hit = h(url, init);
        if (hit) {
          const status = hit.status ?? 200;
          return { ok: status >= 200 && status < 300, status, json: async () => hit.body ?? {} } as Response;
        }
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, collectToast);
  cleanup();
});

const user = () => userEvent.setup({ delay: null });

const ENTRY = {
  id: 1,
  started_at: "2026-07-27 09:00",
  ended_at: "2026-07-27 10:30",
  note: "Refactoring",
  minutes: 90,
  running: false,
};

async function renderTracker(summary: unknown = { weekHours: 0, running: null }, entries: unknown[] = []) {
  respond(/\/time\/summary$/, summary);
  respond(/\/time\/entries$/, { entries });
  render(<TimeTracker />);
  await waitFor(() => expect(calls.some((c) => pathOf(c.url) === "/time/summary")).toBe(true));
  await screen.findByRole("heading", { name: "Letzte Einträge" });
  return user();
}

const posts = () => calls.filter((c) => c.method === "POST");

describe("loading", () => {
  it("fetches the summary and the entries with credentials", async () => {
    await renderTracker();
    expect(calls.some((c) => pathOf(c.url) === "/time/summary")).toBe(true);
    expect(calls.some((c) => pathOf(c.url) === "/time/entries")).toBe(true);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("shows this week's hours in German formatting", async () => {
    await renderTracker({ weekHours: 12.5, running: null });
    expect(await screen.findByText("12,5 h")).toBeTruthy();
  });

  it("falls back to zero hours when the summary fails", async () => {
    respond(/\/time\/summary$/, {}, 500);
    respond(/\/time\/entries$/, { entries: [] });
    render(<TimeTracker />);
    expect(await screen.findByText("0 h")).toBeTruthy();
  });

  it("degrades to an empty list when the entries request fails", async () => {
    respond(/\/time\/summary$/, { weekHours: 0, running: null });
    respond(/\/time\/entries$/, {}, 500);
    render(<TimeTracker />);
    expect(await screen.findByText("Noch keine Einträge.")).toBeTruthy();
  });

  it("does not render entries carried by a NON-OK response", async () => {
    // Against an empty error body the ok-check makes no difference, so this
    // error body deliberately carries entries.
    respond(/\/time\/summary$/, { weekHours: 0, running: null });
    respond(/\/time\/entries$/, { entries: [ENTRY] }, 500);
    render(<TimeTracker />);
    expect(await screen.findByText("Noch keine Einträge.")).toBeTruthy();
  });
});

describe("the running/stopped timer", () => {
  it("offers a start control and a note box when nothing is running", async () => {
    await renderTracker();
    expect(screen.getByRole("button", { name: /Timer starten/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("Woran arbeitest du?")).toBeTruthy();
  });

  it("offers only a stop control while a timer runs", async () => {
    // Both at once would let a second timer start over the first.
    await renderTracker({ weekHours: 1, running: { id: 5, started_at: "09:00", note: null } });
    expect(screen.getByRole("button", { name: /Timer stoppen/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Timer starten/ })).toBeNull();
    expect(screen.queryByPlaceholderText("Woran arbeitest du?")).toBeNull();
  });

  it("shows since when the running timer has been going", async () => {
    await renderTracker({ weekHours: 1, running: { id: 5, started_at: "09:00", note: null } });
    expect(screen.getByText(/Läuft seit 09:00/)).toBeTruthy();
  });

  it("appends the running note when there is one", async () => {
    await renderTracker({ weekHours: 1, running: { id: 5, started_at: "09:00", note: "Doku" } });
    expect(screen.getByText(/Läuft seit 09:00 · Doku/)).toBeTruthy();
  });

  it("omits the separator when the running timer has no note", async () => {
    await renderTracker({ weekHours: 1, running: { id: 5, started_at: "09:00", note: null } });
    expect(screen.queryByText(/09:00 ·/)).toBeNull();
  });

  it("starts a timer with the trimmed note", async () => {
    const u = await renderTracker();
    await u.type(screen.getByPlaceholderText("Woran arbeitest du?"), "  Feature X  ");
    await u.click(screen.getByRole("button", { name: /Timer starten/ }));
    await waitFor(() => expect(posts().some((c) => pathOf(c.url) === "/time/start")).toBe(true));
    expect(posts().find((c) => pathOf(c.url) === "/time/start")!.body).toEqual({ note: "Feature X" });
  });

  it("clears the note box and reloads after starting", async () => {
    const u = await renderTracker();
    await u.type(screen.getByPlaceholderText("Woran arbeitest du?"), "X");
    await u.click(screen.getByRole("button", { name: /Timer starten/ }));
    await waitFor(() => expect(calls.filter((c) => pathOf(c.url) === "/time/summary")).toHaveLength(2));
    expect((screen.getByPlaceholderText("Woran arbeitest du?") as HTMLInputElement).value).toBe("");
  });

  it("stops the running timer and reloads", async () => {
    const u = await renderTracker({ weekHours: 1, running: { id: 5, started_at: "09:00", note: null } });
    await u.click(screen.getByRole("button", { name: /Timer stoppen/ }));
    await waitFor(() => expect(posts().some((c) => pathOf(c.url) === "/time/stop")).toBe(true));
    await waitFor(() => expect(calls.filter((c) => pathOf(c.url) === "/time/summary")).toHaveLength(2));
  });

  it("starts a timer with an empty note when none is typed", async () => {
    const u = await renderTracker();
    await u.click(screen.getByRole("button", { name: /Timer starten/ }));
    await waitFor(() => expect(posts().some((c) => pathOf(c.url) === "/time/start")).toBe(true));
    expect(posts().find((c) => pathOf(c.url) === "/time/start")!.body).toEqual({ note: "" });
  });
});

describe("manual entries", () => {
  const fill = async (u: ReturnType<typeof user>, start: string, end: string, note = "") => {
    const inputs = document.querySelectorAll('input[type="datetime-local"]');
    if (start) await u.type(inputs[0] as HTMLInputElement, start);
    if (end) await u.type(inputs[1] as HTMLInputElement, end);
    if (note) await u.type(screen.getByPlaceholderText("Notiz (optional)"), note);
    await u.click(screen.getByRole("button", { name: "Hinzufügen" }));
  };

  it("requires both a start and an end", async () => {
    const u = await renderTracker();
    await fill(u, "", "");
    expect(await screen.findByText("Start und Ende sind erforderlich.")).toBeTruthy();
    expect(posts().filter((c) => pathOf(c.url) === "/time/entries")).toHaveLength(0);
  });

  it("requires an end even when a start is given", async () => {
    const u = await renderTracker();
    await fill(u, "2026-07-27T09:00", "");
    expect(await screen.findByText("Start und Ende sind erforderlich.")).toBeTruthy();
    expect(posts().filter((c) => pathOf(c.url) === "/time/entries")).toHaveLength(0);
  });

  it("posts a manual entry with a trimmed note", async () => {
    const u = await renderTracker();
    await fill(u, "2026-07-27T09:00", "2026-07-27T10:00", "  Notiz  ");
    await waitFor(() => expect(posts().some((c) => pathOf(c.url) === "/time/entries")).toBe(true));
    expect(posts().find((c) => pathOf(c.url) === "/time/entries")!.body).toEqual({
      started_at: "2026-07-27T09:00",
      ended_at: "2026-07-27T10:00",
      note: "Notiz",
    });
  });

  it("explains a 422 as an end before the start, not a generic error", async () => {
    const u = await renderTracker();
    respond(/\/time\/entries$/, {}, 422, "POST");
    await fill(u, "2026-07-27T10:00", "2026-07-27T09:00");
    expect(await screen.findByText("Ende muss nach dem Start liegen.")).toBeTruthy();
  });

  it("reports any other failure with its status", async () => {
    // A non-validation failure is a transient outcome, so it left the form and
    // became a toast; the status still has to travel, since it is what tells a
    // 401 (session) from a 500 (service) apart.
    const u = await renderTracker();
    respond(/\/time\/entries$/, {}, 500, "POST");
    await fill(u, "2026-07-27T09:00", "2026-07-27T10:00");
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]!.variant).toBe("danger");
    expect(toasts[0]!.message).toContain("500");
  });

  it("clears the form and reloads after a successful add", async () => {
    const u = await renderTracker();
    await fill(u, "2026-07-27T09:00", "2026-07-27T10:00", "Notiz");
    await waitFor(() => expect(calls.filter((c) => pathOf(c.url) === "/time/summary")).toHaveLength(2));
    expect((screen.getByPlaceholderText("Notiz (optional)") as HTMLInputElement).value).toBe("");
  });

  it("keeps the form filled when the add fails", async () => {
    const u = await renderTracker();
    respond(/\/time\/entries$/, {}, 500, "POST");
    await fill(u, "2026-07-27T09:00", "2026-07-27T10:00", "Notiz");
    await waitFor(() => expect(toasts.length).toBe(1));
    expect((screen.getByPlaceholderText("Notiz (optional)") as HTMLInputElement).value).toBe("Notiz");
  });

  it("keeps validation in the form, where the fields are", async () => {
    // 422 is the one case that must NOT auto-dismiss: it points at fields the
    // user still has to correct.
    const u = await renderTracker();
    respond(/\/time\/entries$/, {}, 422, "POST");
    await fill(u, "2026-07-27T10:00", "2026-07-27T09:00");
    expect(await screen.findByText("Ende muss nach dem Start liegen.")).toBeTruthy();
    expect(toasts).toEqual([]);
  });
});

describe("silent mutations (regression)", () => {
  // start/stop/remove used to discard their responses entirely. A stop that
  // never reached the server leaves the timer running against the user's time.
  it("reports a failed stop, and says the timer is still running", async () => {
    await renderTracker({ weekHours: 2, running: { id: 1, started_at: "10:00", note: null } });
    respond(/\/time\/stop$/, {}, 500, "POST");
    await user().click(screen.getByRole("button", { name: /Timer stoppen/ }));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]!.variant).toBe("danger");
    expect(toasts[0]!.message).toMatch(/läuft weiter/);
  });

  it("confirms a started timer", async () => {
    const u = await renderTracker();
    await u.click(screen.getByRole("button", { name: /Timer starten/ }));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]!.variant).toBe("success");
  });
});

describe("the entry list", () => {
  it("formats a duration over an hour as Xh Ym", async () => {
    await renderTracker({ weekHours: 1.5, running: null }, [ENTRY]);
    expect(await screen.findByText("1h 30m")).toBeTruthy();
  });

  it("formats a sub-hour duration as minutes only", async () => {
    await renderTracker({ weekHours: 0, running: null }, [{ ...ENTRY, minutes: 45 }]);
    expect(await screen.findByText("45m")).toBeTruthy();
  });

  it("formats a whole number of hours without dropping the minutes", async () => {
    await renderTracker({ weekHours: 2, running: null }, [{ ...ENTRY, minutes: 120 }]);
    expect(await screen.findByText("2h 0m")).toBeTruthy();
  });

  it("formats a zero-minute entry", async () => {
    await renderTracker({ weekHours: 0, running: null }, [{ ...ENTRY, minutes: 0 }]);
    expect(await screen.findByText("0m")).toBeTruthy();
  });

  it("shows the entry's time range and note", async () => {
    await renderTracker({ weekHours: 1.5, running: null }, [ENTRY]);
    expect(await screen.findByText(/2026-07-27 09:00 – 2026-07-27 10:30/)).toBeTruthy();
    expect(screen.getByText(/Refactoring/)).toBeTruthy();
  });

  it("omits the dash for an entry that has not ended", async () => {
    await renderTracker({ weekHours: 0, running: null }, [{ ...ENTRY, ended_at: null, running: true }]);
    const text = (await screen.findByText(/2026-07-27 09:00/)).textContent!;
    expect(text).not.toContain("–");
  });

  it("marks a running entry", async () => {
    await renderTracker({ weekHours: 0, running: null }, [{ ...ENTRY, running: true }]);
    expect(await screen.findByText("läuft")).toBeTruthy();
  });

  it("does not mark a finished entry", async () => {
    await renderTracker({ weekHours: 0, running: null }, [ENTRY]);
    await screen.findByText("1h 30m");
    expect(screen.queryByText("läuft")).toBeNull();
  });

  it("deletes an entry by id and reloads", async () => {
    const u = await renderTracker({ weekHours: 1.5, running: null }, [ENTRY]);
    await u.click(await screen.findByRole("button", { name: "Löschen" }));
    await waitFor(() => {
      const del = calls.find((c) => c.method === "DELETE");
      expect(pathOf(del!.url)).toBe("/time/entries/1");
    });
    await waitFor(() => expect(calls.filter((c) => pathOf(c.url) === "/time/summary")).toHaveLength(2));
  });

  it("deletes the entry that was clicked, not the first one", async () => {
    const u = await renderTracker({ weekHours: 3, running: null }, [
      ENTRY,
      { ...ENTRY, id: 2, minutes: 30, note: "Zweiter" },
    ]);
    const rows = await screen.findAllByRole("listitem");
    await u.click(within(rows[1]!).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(pathOf(calls.find((c) => c.method === "DELETE")!.url)).toBe("/time/entries/2"));
  });
});
