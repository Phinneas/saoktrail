import { useEffect, useRef, useState } from 'react';

interface Report {
  id: number;
  spring_slug: string;
  visitor_name: string | null;
  visit_date: string | null;
  temperature_observed: number | null;
  flow_status: string | null;
  crowd_level: string | null;
  access_status: string | null;
  body: string | null;
  photo_url: string | null;
  created_at: string;
}

interface Props {
  springSlug: string;
  apiUrl: string;
  turnstileSiteKey?: string;
  site?: string;
}

const FLOW_LABELS: Record<string, string> = {
  flowing: 'Flowing', low: 'Low flow', dry: 'Dry', unknown: '—',
};
const CROWD_LABELS: Record<string, string> = {
  empty: 'Empty', moderate: 'Moderate', busy: 'Busy', unknown: '—',
};
const ACCESS_LABELS: Record<string, string> = {
  open: 'Open', closed: 'Closed', 'road-issue': 'Road issue', unknown: '—',
};

const BADGE: Record<string, string> = {
  flowing: 'bg-emerald-100 text-emerald-700',
  open: 'bg-emerald-100 text-emerald-700',
  empty: 'bg-emerald-100 text-emerald-700',
  low: 'bg-amber-100 text-amber-700',
  moderate: 'bg-amber-100 text-amber-700',
  'road-issue': 'bg-amber-100 text-amber-700',
  dry: 'bg-rose-100 text-rose-700',
  closed: 'bg-rose-100 text-rose-700',
  busy: 'bg-rose-100 text-rose-700',
  unknown: 'bg-slate-100 text-slate-500',
};

function badgeClass(v: string | null) {
  return BADGE[v || 'unknown'] || BADGE.unknown;
}

function fmtDate(d: string | null) {
  if (!d) return 'Recent visit';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function ConditionReports({ springSlug, apiUrl, turnstileSiteKey, site = 'soakcolorado' }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form state
  const [visitorName, setVisitorName] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [temp, setTemp] = useState('');
  const [flow, setFlow] = useState('flowing');
  const [crowd, setCrowd] = useState('empty');
  const [access, setAccess] = useState('open');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [tsToken, setTsToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const tsRef = useRef<HTMLDivElement>(null);
  const tsWidget = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/api/reports?slug=${encodeURIComponent(springSlug)}&limit=20`)
      .then((r) => r.json())
      .then((d) => { if (alive) setReports(d.reports || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiUrl, springSlug]);

  // Render Turnstile widget when the form opens.
  useEffect(() => {
    if (!open || !turnstileSiteKey) return;
    const w = window as any;
    const render = () => {
      if (tsRef.current && w.turnstile) {
        tsWidget.current = w.turnstile.render(tsRef.current, {
          sitekey: turnstileSiteKey,
          callback: (t: string) => setTsToken(t),
          'error-callback': () => setTsToken(''),
        });
      }
    };
    if (w.turnstile) render();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsCb';
      s.async = true;
      (window as any).__tsCb = render;
      document.head.appendChild(s);
    }
    return () => {
      try { w.turnstile?.remove(tsWidget.current!); } catch {}
    };
  }, [open, turnstileSiteKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (turnstileSiteKey && !tsToken) {
      setResult({ ok: false, msg: 'Please complete the spam check.' });
      return;
    }
    setSubmitting(true);
    setResult(null);
    const fd = new FormData();
    fd.append('spring_slug', springSlug);
    fd.append('site', site);
    if (visitorName) fd.append('visitor_name', visitorName);
    if (visitDate) fd.append('visit_date', visitDate);
    if (temp) fd.append('temperature_observed', temp);
    fd.append('flow_status', flow);
    fd.append('crowd_level', crowd);
    fd.append('access_status', access);
    if (body) fd.append('body', body);
    if (photo) fd.append('photo', photo);
    if (tsToken) fd.append('cf-turnstile-response', tsToken);

    try {
      const res = await fetch(`${apiUrl}/api/reports`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ ok: true, msg: 'Thanks! Your report is submitted and pending review.' });
        setBody(''); setPhoto(null); setTemp(''); setVisitDate(''); setVisitorName('');
        setOpen(false);
        try { (window as any).turnstile?.reset(tsWidget.current!); } catch {}
      } else if (res.status === 429) {
        setResult({ ok: false, msg: 'Too many submissions — please try again later.' });
      } else {
        setResult({ ok: false, msg: data.error || 'Submission failed.' });
      }
    } catch {
      setResult({ ok: false, msg: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="my-10">
      <h2 className="text-2xl font-bold mb-1">Recent conditions</h2>
      <p className="text-sm text-slate-500 mb-4">
        Reported by visitors. Submissions are moderated before they appear here.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-slate-400">No visitor reports yet. Be the first to share conditions.</p>
      ) : (
        <ul className="space-y-3 mb-6">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-semibold text-slate-800">{r.visitor_name || 'Anonymous'}</span>
                <span className="text-xs text-slate-400">{fmtDate(r.visit_date)}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {r.temperature_observed != null && (
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {r.temperature_observed}°F
                  </span>
                )}
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(r.flow_status)}`}>
                  {FLOW_LABELS[r.flow_status || 'unknown']}
                </span>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(r.crowd_level)}`}>
                  {CROWD_LABELS[r.crowd_level || 'unknown']}
                </span>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(r.access_status)}`}>
                  {ACCESS_LABELS[r.access_status || 'unknown']}
                </span>
              </div>
              {r.body && <p className="text-sm text-slate-700 leading-relaxed">{r.body}</p>}
              {r.photo_url && (
                <img
                  src={`${apiUrl}${r.photo_url}`}
                  alt="Visitor photo"
                  loading="lazy"
                  className="mt-3 rounded-lg max-h-72 w-auto border border-slate-200"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {result && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {result.msg}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:border-amber-500 hover:text-amber-700 transition"
        >
          Report conditions
        </button>
      ) : (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Your name (optional)</span>
              <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} maxLength={80}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Anonymous" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Visit date</span>
              <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Observed temp °F (optional)</span>
              <input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} min={32} max={212}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. 104" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Photo (optional)</span>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Water flow</span>
              <select value={flow} onChange={(e) => setFlow(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="flowing">Flowing</option>
                <option value="low">Low flow</option>
                <option value="dry">Dry</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Crowd level</span>
              <select value={crowd} onChange={(e) => setCrowd(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="empty">Empty</option>
                <option value="moderate">Moderate</option>
                <option value="busy">Busy</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs font-medium text-slate-500 mb-1">Access status</span>
              <select value={access} onChange={(e) => setAccess(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="road-issue">Road issue</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Parking, road conditions, water clarity, anything that changed…" />
          </label>
          {turnstileSiteKey && <div ref={tsRef} className="min-h-[65px]" />}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting}
              className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition">
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
