'use client';

import { useEffect, useState } from 'react';

export default function InstallerPage() {
  const [me, setMe] = useState(null);
  const [adminKey, setAdminKey] = useState('');
  const [sql, setSql] = useState('');
  const [msg, setMsg] = useState('');
  const [examples, setExamples] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setMsg('');
      const meRes = await fetch('/api/auth/me', { cache:'no-store' });
      const meJ = await meRes.json().catch(() => ({}));
      if (!meRes.ok) return alive && setMsg('Nicht eingeloggt');
      if (alive) setMe(meJ);
      if (!meJ?.isAdmin) return alive && setMsg('Nur Admin. (ADMIN_EMAILS)');

      const exRes = await fetch('/api/admin/sql/examples', { cache:'no-store' });
      const exJ = await exRes.json().catch(() => ({}));
      if (exRes.ok && alive) setExamples(exJ.examples || []);
    })();
    return () => { alive = false; };
  }, []);

  async function run() {
    setMsg('');
    try {
      if (!sql.trim()) throw new Error('Bitte SQL einfügen.');
      const res = await fetch('/api/admin/sql', {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-actions-key': adminKey || ''
        },
        body: JSON.stringify({ sql })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'SQL failed');
      setMsg('OK: SQL ausgeführt.');
    } catch (e) {
      setMsg(e?.message || String(e));
    }
  }

  if (!me?.isAdmin) {
    return (
      <div className="card">
        <div className="h1">Installer</div>
        <div className="error" style={{ marginTop:10 }}>{msg || 'Nur Admin.'}</div>
        <div style={{ marginTop:10 }}>
          <a className="secondary" href="/admin" style={{ textDecoration:'none' }}>Zurück</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div className="card">
        <div className="h1">Admin · Installer</div>
        <div className="sub">SQL ausführen (benötigt exec_sql() in DB) + optional ADMIN_ACTIONS_KEY</div>
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:6 }}>ADMIN_ACTIONS_KEY</div>
        <div className="muted" style={{ fontSize:12, marginBottom:10 }}>
          Wenn du <code>ADMIN_ACTIONS_KEY</code> in Vercel gesetzt hast, muss er hier eingegeben werden.
        </div>
        <input className="input" value={adminKey} onChange={(e)=>setAdminKey(e.target.value)} placeholder="(optional, falls env gesetzt)" />
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:10 }}>Beispiele</div>
        <div className="row" style={{ flexWrap:'wrap' }}>
          {examples.map((ex) => (
            <button key={ex.name} className="secondary" type="button" onClick={()=>setSql(ex.sql)}>
              {ex.name}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize:12, marginTop:10 }}>
          Tipp: Zuerst <strong>00 core users</strong>, dann <strong>01 exec_sql</strong>, dann <strong>02 apps registry</strong>, dann <strong>03 import tables</strong>.
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:8 }}>SQL</div>
        <textarea value={sql} onChange={(e)=>setSql(e.target.value)} placeholder="SQL hier einfügen…" />
        <div className="row" style={{ marginTop:10 }}>
          <button className="primary" onClick={run}>Ausführen</button>
          <a className="secondary" href="/admin" style={{ textDecoration:'none' }}>Zurück</a>
        </div>
        {msg ? <div className={msg.startsWith('OK') ? 'card' : 'error'} style={{ marginTop:12 }}>{msg}</div> : null}
      </div>
    </div>
  );
}
