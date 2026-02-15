'use client';

import { useEffect, useMemo, useState } from 'react';

function slugKey(v) {
  if (v == null) return '';
  return String(v)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    r.onload = () => resolve(String(r.result || ''));
    r.readAsDataURL(file);
  });
}

function Logo({ src, alt }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || ''} src={src} style={{ width: 22, height: 22, objectFit: 'contain' }} />
  );
}

function Section({ title, apiBase }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [icon, setIcon] = useState('');

  const [editingKey, setEditingKey] = useState('');
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  async function load() {
    setErr('');
    setMsg('');
    try {
      const res = await fetch(apiBase, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Laden fehlgeschlagen');
      setRows(j?.rows || []);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // auto-fill key
    if (!key && name) setKey(slugKey(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function createOrUpdate() {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), name: name.trim(), icon_data: icon || null })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen');
      setMsg('Gespeichert.');
      setName('');
      setKey('');
      setIcon('');
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(r) {
    setEditingKey(r.key);
    setEditName(r.name || '');
    setEditIcon(r.icon_data || '');
  }

  async function saveEdit() {
    if (!editingKey) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: editingKey, name: editName.trim(), icon_data: editIcon || null })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen');
      setMsg('Aktualisiert.');
      setEditingKey('');
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(k) {
    if (!k) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(apiBase, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: k })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Löschen fehlgeschlagen');
      setMsg('Gelöscht. (Undo im Admin-Log möglich)');
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const hasTablesMissing = useMemo(() => {
    const s = String(err || '').toLowerCase();
    return s.includes('does not exist') || s.includes('relation');
  }, [err]);

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <div className="muted" style={{ fontSize: 12 }}>Keys sollten in den Daten (dealers) so vorkommen, wie sie hier angelegt sind.</div>
        </div>
        <button className="secondary" type="button" onClick={load} disabled={busy}>Neu laden</button>
      </div>

      {err ? (
        <div className="error">
          {err}
          {hasTablesMissing ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Hinweis: bitte im <strong>Admin → Installer</strong> das Script <strong>04 manufacturers + buying groups</strong> ausführen.
            </div>
          ) : null}
        </div>
      ) : null}

      {msg ? <div className="muted" style={{ fontSize: 12 }}>{msg}</div> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <div className="label">Name</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. FLYER" />
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="label">Key</div>
            <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="z.B. flyer" />
          </div>
          <div style={{ minWidth: 240 }}>
            <div className="label">Piktogramm</div>
            <div className="row" style={{ alignItems: 'center' }}>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const dataUrl = await fileToDataUrl(f);
                  setIcon(dataUrl);
                }}
              />
              <Logo src={icon} alt={name} />
            </div>
          </div>
          <button className="primary" type="button" onClick={createOrUpdate} disabled={busy || !name.trim() || !key.trim()}>Speichern</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {(rows || []).map((r) => (
            <div key={r.key} className="card" style={{ padding: 12 }}>
              {editingKey === r.key ? (
                <>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900 }}>{r.key}</div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button className="primary" type="button" onClick={saveEdit} disabled={busy || !editName.trim()}>Speichern</button>
                      <button className="secondary" type="button" onClick={() => setEditingKey('')} disabled={busy}>Abbrechen</button>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ minWidth: 260 }}>
                      <div className="label">Name</div>
                      <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 260 }}>
                      <div className="label">Piktogramm</div>
                      <div className="row">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const dataUrl = await fileToDataUrl(f);
                            setEditIcon(dataUrl);
                          }}
                        />
                        <Logo src={editIcon} alt={editName} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="row" style={{ alignItems: 'center' }}>
                    <Logo src={r.icon_data} alt={r.name} />
                    <div>
                      <div style={{ fontWeight: 900 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.key}</div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="secondary" type="button" onClick={() => startEdit(r)} disabled={busy}>Bearbeiten</button>
                    <button className="secondary" type="button" onClick={() => remove(r.key)} disabled={busy}>Löschen</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminBrandsPage() {
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const meJ = await meRes.json().catch(() => ({}));
      if (!meRes.ok) return setErr('Nicht eingeloggt');
      if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');
    })();
  }, []);

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Hersteller & Einkaufsverbände</div>
        <div className="error" style={{ marginTop: 10 }}>{err}</div>
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">Admin · Hersteller & Einkaufsverbände</div>
        <div className="sub">Piktogramme anlegen, bearbeiten und löschen. Undo ist über <strong>Admin → Log</strong> möglich.</div>
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        </div>
      </div>

      <Section title="Hersteller" apiBase="/api/admin/manufacturers" />
      <Section title="Einkaufsverbände" apiBase="/api/admin/buying-groups" />
    </div>
  );
}
