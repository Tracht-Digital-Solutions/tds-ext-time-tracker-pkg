import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";

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

const api = (path: string, init?: RequestInit) => fetch(path, { credentials: "include", ...init });

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

  const start = async () => {
    setBusy(true);
    await api("/time/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    setNote("");
    setBusy(false);
    void load();
  };

  const stop = async () => {
    setBusy(true);
    await api("/time/stop", { method: "POST" });
    setBusy(false);
    void load();
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
      void load();
    } else {
      setStatus(res.status === 422 ? "Ende muss nach dem Start liegen." : `Fehler (HTTP ${res.status}).`);
    }
  };

  const remove = async (e: Entry) => {
    await api(`/time/entries/${e.id}`, { method: "DELETE" });
    void load();
  };

  const running = summary?.running ?? null;

  return (
    <div className="time-tracker space-y-6">
      <div className="time-tracker__timer rounded-xl border border-[color:var(--color-line)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm opacity-70">Diese Woche</p>
            <p className="text-2xl font-semibold">{(summary?.weekHours ?? 0).toLocaleString("de-DE")} h</p>
          </div>
          {running ? (
            <button type="button" onClick={stop} disabled={busy}>⏹ Timer stoppen</button>
          ) : (
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Woran arbeitest du?" />
              <button type="button" onClick={start} disabled={busy}>▶ Timer starten</button>
            </div>
          )}
        </div>
        {running ? (
          <p className="text-xs opacity-70 mt-2">Läuft seit {running.started_at}{running.note ? ` · ${running.note}` : ""}</p>
        ) : null}
      </div>

      <details className="time-tracker__manual">
        <summary>Eintrag manuell erfassen</summary>
        <div className="flex flex-wrap gap-2 mt-3">
          <label className="text-sm">
            Start
            <input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </label>
          <label className="text-sm">
            Ende
            <input type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
          </label>
          <input value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Notiz (optional)" />
          <button type="button" onClick={addManual} disabled={busy}>Hinzufügen</button>
        </div>
        {status ? <p className="tds-alert mt-2" role="status">{status}</p> : null}
      </details>

      <div className="time-tracker__list">
        <h3>Letzte Einträge</h3>
        {entries === null ? (
          <p role="status"><Spinner /></p>
        ) : entries.length === 0 ? (
          <p className="text-sm opacity-70">Noch keine Einträge.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
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
