import { useEffect, useState } from "react";
import { Spinner, toast } from "@tracht-digital-solutions/tds-shared/components";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

interface Entry {
  id: number;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  minutes: number;
  running: boolean;
}

interface Summary {
  weekHours: number;
  running: { id: number; started_at: string; note: string | null } | null;
}

const api = apiFetch;

/** Minutes → "Xh Ym" (or "Ym"). */
function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Full time-tracker page: a start/stop timer, a manual-entry form, and the
 * recent-entries list — all scoped to the logged-in user by the API. Relative
 * fetch with the session cookie, matching every other extension island.
 */
export default function TimeTracker() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [note, setNote] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, e] = await Promise.all([
      api("/time/summary").then((r) => (r.ok ? r.json() : null)),
      api("/time/entries").then((r) => (r.ok ? r.json() : { entries: [] })),
    ]);
    setSummary(s);
    setEntries(e.entries ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  // start/stop/remove used to discard their responses. That is worse here than
  // a missing confirmation: a stop that never reached the server leaves the
  // timer running, and a delete that failed makes the row reappear on the next
  // load with no explanation. Tracked time is data — a silent loss is a wrong
  // invoice later.
  const start = async () => {
    setBusy(true);
    try {
      const res = await api("/time/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (res.ok) {
        setNote("");
        toast.success("Timer gestartet.");
      } else {
        toast.danger(`Timer konnte nicht gestartet werden (HTTP ${res.status}).`);
      }
    } catch {
      toast.danger("Timer konnte nicht gestartet werden — die API ist nicht erreichbar.");
    } finally {
      setBusy(false);
      void load();
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const res = await api("/time/stop", { method: "POST" });
      if (res.ok) toast.success("Timer gestoppt.");
      else toast.danger(`Timer konnte nicht gestoppt werden (HTTP ${res.status}) — er läuft weiter.`);
    } catch {
      toast.danger("Timer konnte nicht gestoppt werden — die API ist nicht erreichbar.");
    } finally {
      setBusy(false);
      void load();
    }
  };

  const addManual = async () => {
    if (manualStart === "" || manualEnd === "") {
      setStatus("Start und Ende sind erforderlich.");
      return;
    }
    setBusy(true);
    const res = await api("/time/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ started_at: manualStart, ended_at: manualEnd, note: manualNote.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setManualStart("");
      setManualEnd("");
      setManualNote("");
      setStatus(null);
      toast.success("Eintrag gespeichert.");
      void load();
    } else if (res.status === 422) {
      // Validation stays IN THE FORM: it points at the fields the user still
      // has to fix, and must not blend itself away while they read them.
      setStatus("Ende muss nach dem Start liegen.");
    } else {
      setStatus(null);
      toast.danger(`Eintrag konnte nicht gespeichert werden (HTTP ${res.status}).`);
    }
  };

  const remove = async (e: Entry) => {
    try {
      const res = await api(`/time/entries/${e.id}`, { method: "DELETE" });
      if (res.ok) toast.success("Eintrag gelöscht.");
      else toast.danger(`Löschen fehlgeschlagen (HTTP ${res.status}).`);
    } catch {
      toast.danger("Löschen fehlgeschlagen — die API ist nicht erreichbar.");
    } finally {
      void load();
    }
  };

  const running = summary?.running ?? null;

  return (
    <div className="time-tracker space-y-6">
      <div className="time-tracker__timer rounded-xl border border-[color:var(--color-line)] p-4">
        {/* Wraps: the right-hand side nests a full-width text field next to
            the start button, so this row cannot hold the week total as well
            on a phone. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm opacity-70">Diese Woche</p>
            <p className="text-2xl font-semibold">{(summary?.weekHours ?? 0).toLocaleString("de-DE")} h</p>
          </div>
          {running ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={stop}
              disabled={busy}
              aria-busy={busy}
            >
              ⏹ Timer stoppen
            </button>
          ) : (
            <div className="tds-toolbar">
              <input
                className="field-boxed"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Woran arbeitest du?"
                aria-label="Woran arbeitest du?"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={start}
                disabled={busy}
                aria-busy={busy}
              >
                ▶ Timer starten
              </button>
            </div>
          )}
        </div>
        {running ? (
          <p className="text-xs opacity-70 mt-2">Läuft seit {running.started_at}{running.note ? ` · ${running.note}` : ""}</p>
        ) : null}
      </div>

      <details className="time-tracker__manual">
        <summary>Eintrag manuell erfassen</summary>
        <div className="tds-toolbar mt-3">
          <label className="tds-field-row">
            Start
            <input className="field-boxed" type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </label>
          <label className="tds-field-row">
            Ende
            <input className="field-boxed" type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
          </label>
          <input
            className="field-boxed"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="Notiz (optional)"
            aria-label="Notiz"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={addManual}
            disabled={busy}
            aria-busy={busy}
          >
            Hinzufügen
          </button>
        </div>
        {/* Only validation reaches this now (the transient outcomes are
            toasts), so it is a failure and gets the danger hue — it used to
            render "Ende muss nach dem Start liegen." in the info blue. */}
        {status ? <p className="tds-alert tds-alert--danger mt-2" role="alert">{status}</p> : null}
      </details>

      <div className="tds-stack">
        <h3>Letzte Einträge</h3>
        {entries === null ? (
          <p><Spinner /></p>
        ) : entries.length === 0 ? (
          <p className="text-sm opacity-70">Noch keine Einträge.</p>
        ) : (
          <ul className="tds-list">
            {entries.map((e) => (
              // `.tds-list__row` rather than a hand-rolled flex: five children
              // (duration, chip, a timestamp range, a free-text note and a
              // button) never fitted one un-wrappable line on a phone.
              <li key={e.id} className="tds-list__row text-sm">
                <span className="font-medium">{fmt(e.minutes)}</span>
                {e.running ? <span className="chip chip--info">läuft</span> : null}
                <span className="opacity-70">{e.started_at}{e.ended_at ? ` – ${e.ended_at}` : ""}</span>
                {e.note ? <span className="opacity-70">· {e.note}</span> : null}
                <button type="button" className="btn btn-danger text-xs ml-auto" onClick={() => remove(e)}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
