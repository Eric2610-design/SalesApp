'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function AdminApps() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [apps, setApps] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ slug: '', title: '', icon: '🧩', href: '', sort: 100, is_enabled: true });
  const [visibility, setVisibility] = useState({ Aussendienst: true, CEO: true });
  const [dock, setDock] = useState({ Aussendienst: '', CEO: '' });

  async function load() {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const t = sess?.access_token;
      if (!t) throw new Error('Bitte einloggen');

      const res = await fetch('/api/admin/apps', { headers: { authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Konnte Apps nicht laden');
      setApps(j.apps || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createApp() {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const t = sess?.access_token;
      if (!t) throw new Error('Bitte einloggen');

      const res = await fetch('/api/admin/apps', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({
          slug: form.slug,
          title: form.title,
          icon: form.icon,
          type: 'link',
          href: form.href || undefined,
          sort: Number(form.sort) || 100,
          is_enabled: !!form.is_enabled,
          visibilityByGroup: visibility,
          dockByGroup: dock,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Konnte App nicht erstellen');

      setMsg('App erstellt ✅');
      setForm({ slug: '', title: '', icon: '🧩', href: '', sort: 100, is_enabled: true });
      setDock({ Aussendienst: '', CEO: '' });
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Admin · Apps</h1>
        <p className="sub">Apps hinzufügen (Homescreen & Dock kommen aus Supabase).</p>

        {err ? <div className="error">{err}</div> : null}
        {msg ? <div className="toast">{msg}</div> : null}

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Neue App</strong>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Slug</label><br/>
              <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="z.B. lager" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Titel</label><br/>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="z.B. Lagerbestand" />
            </div>
            <div style={{ width: 120 }}>
              <label>Icon</label><br/>
              <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="🏭" />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label>Href (Route)</label><br/>
              <input value={form.href} onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))} placeholder="/inventory oder /database" />
              <div className="sub" style={{ marginTop: 6 }}>Wenn leer: /apps/&lt;slug&gt;.</div>
            </div>
            <div style={{ width: 120 }}>
              <label>Sort</label><br/>
              <input value={form.sort} onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <label className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={!!form.is_enabled} onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))} />
              aktiviert
            </label>
          </div>

          <hr className="sep" style={{ marginTop: 14 }} />

          <strong>Sichtbarkeit</strong>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label className="row" style={{ justifyContent: 'space-between' }}>
              <span>Aussendienst</span>
              <input type="checkbox" checked={!!visibility.Aussendienst} onChange={(e) => setVisibility((v) => ({ ...v, Aussendienst: e.target.checked }))} />
            </label>
            <label className="row" style={{ justifyContent: 'space-between' }}>
              <span>CEO</span>
              <input type="checkbox" checked={!!visibility.CEO} onChange={(e) => setVisibility((v) => ({ ...v, CEO: e.target.checked }))} />
            </label>
            <div className="sub">Admin sieht immer alles.</div>
          </div>

          <hr className="sep" style={{ marginTop: 14 }} />
          <strong>Dock Favorit (Position)</strong>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ width: 160 }}>
              <label>Aussendienst</label><br/>
              <input value={dock.Aussendienst || ''} onChange={(e) => setDock((d) => ({ ...d, Aussendienst: e.target.value }))} placeholder="z.B. 2" />
            </div>
            <div style={{ width: 160 }}>
              <label>CEO</label><br/>
              <input value={dock.CEO || ''} onChange={(e) => setDock((d) => ({ ...d, CEO: e.target.value }))} placeholder="z.B. 3" />
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={createApp} disabled={busy || !form.slug || !form.title}>
              {busy ? '…' : 'App erstellen'}
            </button>
            <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
              Homescreen →
            </a>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Apps (aktuell)</h2>
        <div className="sub">Aus der Tabelle <b>apps</b>.</div>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {(apps || []).map((a) => (
            <div key={a.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{a.icon} {a.title}</strong>
                <span className="sub">{a.slug}</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>href: <span style={{ fontFamily: 'ui-monospace' }}>{a.href}</span></div>
              <div className="sub">enabled: {String(a.is_enabled)}</div>
            </div>
          ))}
          {!apps?.length ? <div className="sub">Keine Apps gefunden. Bitte `supabase/apps_registry.sql` ausführen.</div> : null}
        </div>
      </div>
    </div>
  );
}
