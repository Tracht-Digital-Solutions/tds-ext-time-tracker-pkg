import { useEffect, useState } from "react";
import { Skeleton } from "@tracht-digital-solutions/tds-shared/components";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

interface Summary {
  weekHours: number;
  running: { id: number; started_at: string; note: string | null } | null;
}

/**
 * Dashboard widget body — this week's tracked hours + a running-timer hint.
 * Fetches the manifest's dataEndpoint (`/time/summary`) via the panel API
 * (same-origin relative fetch with the session cookie, like every extension).
 */
export default function WeekSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch("/time/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: Summary) => setData(d))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="tds-widget__metric">–</p>;
  if (data === null) return <p className="tds-widget__metric" aria-busy="true"><Skeleton width="3ch" height="1.75rem" /></p>;

  return (
    <div>
      <p className="tds-widget__metric">{data.weekHours.toLocaleString("de-DE")} h</p>
      {data.running ? <p className="text-xs opacity-70">⏱ Timer läuft</p> : null}
    </div>
  );
}
