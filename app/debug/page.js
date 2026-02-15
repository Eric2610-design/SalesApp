'use client';

import { useMemo, useState } from 'react';

function clip(s, n = 160) {
  const str = (s ?? '').toString();
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function maskKey(k) {
  if (!k) return '—';
  const s = k.toString();
  return `${s.slice(0, 18)}…${s.slice(-6)} (len ${s.length})`;
}
async function timedFetch(url, init = {}, ms = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache:'no-store' });
    const text = await res.text();
    const dur = Math.round(performance.now() - start);
    return { ok: res.ok, status: res.status, dur, text: clip(text, 600) };
  } finally { clearTimeout(t); }
}

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  const endpoints = useMemo(() => {
    const base = supabaseUrl?.replace(/\/+$/, '');
    return base ? [
      { name:'Auth Health', url: `${base}/auth/v1/health` },
      { name:'Auth Settings', url: `${base}/auth/v1/settings` },
      { name:'REST Root', url: `${base}/rest/v1/` }
    ] : [];
  }, [supabaseUrl]);

  async function run() {
    setRunning(true);
    setResults([]);
    try {
      if (!supabaseUrl || !anonKey) {
        setResults([{ name:'ENV', ok:false, status:0, dur:0, text:'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' }]);
        return;
      }
      const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
      const out = [];
      for (const ep of endpoints) {
        try { out.push({ name: ep.name, ...(await timedFetch(ep.url, { headers }, 12000)) }); }
        catch (e) { out.push({ name: ep.name, ok:false, status:0, dur:12000, text:`ERROR: ${e?.message || String(e)}` }); }
      }
      setResults(out);
    } finally { setRunning(false); }
  }

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div className="card">
        <div className="h1">Debug</div>
        <div className="sub">Supabase Verbindungstest (Client)</div>
        <div className="muted" style={{ fontSize:12, marginTop:8 }}>URL: {supabaseUrl || '—'}</div>
        <div className="muted" style={{ fontSize:12 }}>Key: {maskKey(anonKey)}</div>
        <div className="row" style={{ marginTop:12 }}>
          <button className="primary" onClick={run} disabled={running}>{running ? 'Teste…' : 'Verbindung testen'}</button>
          <a className="secondary" href="/login" style={{ textDecoration:'none' }}>Zum Login</a>
        </div>
        <div className="muted" style={{ marginTop:10, fontSize:12 }}>
          REST Root kann rot sein. Auth Health/Settings sollten schnell antworten.
        </div>
      </div>

      {results.length ? (
        <div className="card">
          <div style={{ fontWeight:800, marginBottom:8 }}>Ergebnisse</div>
          <div style={{ display:'grid', gap:10 }}>
            {results.map(r => (
              <div key={r.name} style={{
                padding:10, borderRadius:14, border:'1px solid rgba(15,23,42,.12)',
                background: r.ok ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)'
              }}>
                <div className="row" style={{ justifyContent:'space-between' }}>
                  <div style={{ fontWeight:800 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize:12 }}>HTTP {r.status || '—'} · {r.dur}ms</div>
                </div>
                <div style={{ marginTop:6, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize:12, whiteSpace:'pre-wrap' }}>
                  {r.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
