
/**
 * Path + query of a request. The island calls an ABSOLUTE URL now (via
 * `apiFetch`); a relative one would hit the product's own static host and come
 * back as SPA-fallback HTML with a 200. Matching on the path keeps the route
 * matchers below anchored.
 */
const pathOf = (url: string) => String(url).replace(/^https?:\/\/[^/]+/i, "");
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { primeRuntimeConfig } from "@tracht-digital-solutions/tds-shared/api";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import WeekSummary from "./WeekSummary";

/**
 * The dashboard widget body. It has three visual states — loading, failed and
 * loaded — and the distinction between the last two matters: a widget that
 * renders "0 h" on a failed request tells the user they tracked nothing this
 * week, which is a different (and wrong) claim from "–".
 */

let response: { status: number; body: unknown } | "reject" = { status: 200, body: { weekHours: 0, running: null } };

beforeEach(() => {
  response = { status: 200, body: { weekHours: 0, running: null } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (response === "reject") throw new TypeError("offline");
      return {
        ok: response.status < 300,
        status: response.status,
        json: async () => response === "reject" ? {} : response.body,
      } as Response;
    }),
  );
});

afterEach(() => cleanup());

// apiFetch consults the host-side runtime config (/tds-runtime.json) before it
// resolves a URL, so without this the first entry in fetch.mock.calls is that
// probe rather than the endpoint under test. The panel products never ship the
// file — they render <meta name="tds-api-base"> instead — so "absent" is also
// what actually happens in production.
beforeEach(() => primeRuntimeConfig(null));

describe("the widget", () => {
  it("fetches its summary endpoint with credentials", async () => {
    render(<WeekSummary />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(pathOf(fetchMock.mock.calls[0]![0] as string)).toBe("/time/summary");
    // Absolute, on the API host. Every other assertion here matches the PATH,
    // which a relative fetch satisfies too — so this is the one that fails if
    // the call ever goes back to the product's own origin (whose SPA fallback
    // answers 200 + HTML and turns into a silent empty state).
    expect(String(fetchMock.mock.calls[0]![0]).startsWith("https://api.tracht-digital.de/")).toBe(true);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("renders the tracked hours in German formatting", async () => {
    response = { status: 200, body: { weekHours: 1234.5, running: null } };
    render(<WeekSummary />);
    expect(await screen.findByText("1.234,5 h")).toBeTruthy();
  });

  it("renders zero hours as a real value, not a dash", async () => {
    render(<WeekSummary />);
    expect(await screen.findByText("0 h")).toBeTruthy();
  });

  it("shows a dash on an error rather than claiming zero hours", async () => {
    // "0 h" would assert the user tracked nothing; "–" says we do not know.
    response = { status: 500, body: {} };
    render(<WeekSummary />);
    expect(await screen.findByText("–")).toBeTruthy();
  });

  it("shows a dash when the request rejects", async () => {
    response = "reject";
    render(<WeekSummary />);
    expect(await screen.findByText("–")).toBeTruthy();
  });

  it("does not render hours carried by a NON-OK response", async () => {
    response = { status: 403, body: { weekHours: 99, running: null } };
    render(<WeekSummary />);
    expect(await screen.findByText("–")).toBeTruthy();
    expect(screen.queryByText(/99/)).toBeNull();
  });

  it("hints when a timer is running", async () => {
    response = { status: 200, body: { weekHours: 2, running: { id: 1, started_at: "09:00", note: null } } };
    render(<WeekSummary />);
    expect(await screen.findByText(/Timer läuft/)).toBeTruthy();
  });

  it("shows no hint when no timer is running", async () => {
    render(<WeekSummary />);
    await screen.findByText("0 h");
    expect(screen.queryByText(/Timer läuft/)).toBeNull();
  });

  it("shows a placeholder before the request resolves", () => {
    render(<WeekSummary />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
