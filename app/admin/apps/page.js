'use client';

import { useEffect, useState } from 'react';

export default function AdminAppsPage() {
  const [apps, setApps] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ slug:'', title:'', icon:'🧩', href:'', sort: 100, enabled: true });
  const [busyId, setBusyId] = useState('');

  async function loadAll() {
    setErr('');
    const meRes = await fetch('/api/auth/me', { cache:'no-store' });
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    const meJ = await meRes.json();
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

    const res = await fetch('/api/admin/apps', { cache:'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(j?.error || 'Fehler');
    setApps(j.apps || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function createApp() {
    setErr('');
    try {
      const slug = form.slug.trim();
      const payload = {
        slug,
        title: form.title.trim(),
        icon: form.icon || '•',
        href: (form.href || '').trim() || `/apps/${slug}`,
        sort: Number(form.sort || 100),
        enabled: !!form.enabled
      };
      const res = await fetch('/api/admin/apps', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Create failed');
      await loadAll();
      setForm({ slug:'', title:'', icon:'🧩', href:'', sort: 100, enabled: true });
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function setEnabled(id, next) {
    setErr('');
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/apps', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, is_enabled: !!next })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Update failed');
      await loadAll();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function deleteApp(id, slug) {
    if (!window.confirm(`App wirklich löschen?\n\n${slug}`)) return;
    setErr('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/apps?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Delete failed');
      await loadAll();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  if (err) return <div className="error">{err}<div style={{ marginTop:10 }}><a className="secondary" href="/admin">Zurück</a></div></div>;

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div className="card">
        <div className="h1">Admin · Apps</div>
        <div className="sub">Apps Registry verwalten</div>
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:10 }}>Neue App</div>
        <div className="row" style={{ flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:160 }}>
            <div className="label">Slug</div>
            <input className="input" value={form.slug} onChange={(e)=>setForm(f=>({...f, slug:e.target.value}))} placeholder="dealers" />
          </div>
          <div style={{ flex:1, minWidth:160 }}>
            <div className="label">Titel</div>
            <input className="input" value={form.title} onChange={(e)=>setForm(f=>({...f, title:e.target.value}))} placeholder="Händler" />
          </div>
          <div style={{ width:110 }}>
            <div className="label">Icon</div>
            <input className="input" value={form.icon} onChange={(e)=>setForm(f=>({...f, icon:e.target.value}))} />
          </div>
        </div>

        <div className="row" style={{ marginTop:10, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:240 }}>
            <div className="label">Href</div>
            <input className="input" value={form.href} onChange={(e)=>setForm(f=>({...f, href:e.target.value}))} placeholder="/database" />
          </div>
          <div style={{ width:120 }}>
            <div className="label">Sort</div>
            <input className="input" type="number" value={form.sort} onChange={(e)=>setForm(f=>({...f, sort:e.target.value}))} />
          </div>
          <label className="row" style={{ gap:8 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e)=>setForm(f=>({...f, enabled:e.target.checked}))} />
            <span className="label">enabled</span>
          </label>
          <button className="primary" onClick={createApp} disabled={!form.slug || !form.title}>Anlegen</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:10 }}>Apps ({apps.length})</div>
        <div style={{ display:'grid', gap:10 }}>
          {apps.map(a => (
            <div key={a.id} style={{ padding:10, borderRadius:14, border:'1px solid rgba(15,23,42,.12)', background:'rgba(255,255,255,.7)' }}>
              <div className="row" style={{ justifyContent:'space-between' }}>
                <div style={{ fontWeight:800 }}>{a.icon} {a.title} <span className="muted" style={{ fontSize:12 }}>({a.slug})</span></div>
                <div className="row" style={{ gap:10 }}>
                  <label className="row" style={{ gap:8 }}>
                    <input
                      type="checkbox"
                      checked={!!a.is_enabled}
                      disabled={busyId === a.id}
                      onChange={(e) => setEnabled(a.id, e.target.checked)}
                    />
                    <span className="muted" style={{ fontSize:12 }}>{a.is_enabled ? 'aktiv' : 'inaktiv'}</span>
                  </label>
                  <button
                    className="secondary"
                    disabled={busyId === a.id}
                    onClick={() => deleteApp(a.id, a.slug)}
                    title="Löschen"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="muted" style={{ fontSize:12, marginTop:4 }}>{a.href}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <a className="secondary" href="/admin" style={{ textDecoration:'none' }}>Zurück</a>
      </div>
    </div>
  );
}
