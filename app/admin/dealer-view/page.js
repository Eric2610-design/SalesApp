'use client';

import { useEffect, useMemo, useState } from 'react';

function collectColumns(rows, maxRows = 120) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj).forEach((k) => keys.add(k));
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export default function AdminDealerViewPage() {
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [dealersCols, setDealersCols] = useState([]);
  const [backlogCols, setBacklogCols] = useState([]);

  const [cfg, setCfg] = useState({
    // Default: Kundennummer (passt zu deiner Kundendatei)
    dealer_key: 'Kundennummer',
    backlog_key: 'Kundennummer',
    backlog_enabled: true,
    backlog_group_enabled: false,
    backlog_group_by: '',
    dealer_columns: [],
    backlog_columns: []
  });

  useEffect(() => {
    async function load() {
      setErr('');
      setMsg('');

      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const meJ = await meRes.json().catch(() => ({}));
      if (!meRes.ok) return setErr('Nicht eingeloggt');
      if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

      try {
        const [pc, d, b] = await Promise.all([
          fetch('/api/admin/page-config?key=dealer_view', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/data/dealers?limit=80', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/data/backlog?limit=80', { cache: 'no-store' }).then((r) => r.json())
        ]);

        if (pc?.error) throw new Error(pc.error);
        if (d?.error) throw new Error(d.error);
        if (b?.error) throw new Error(b.error);

        const dc = collectColumns(d?.rows || []);
        const bc = collectColumns(b?.rows || []);
        setDealersCols(dc);
        setBacklogCols(bc);

        const existing = (pc?.config && typeof pc.config === 'object') ? pc.config : {};
        setCfg({
          dealer_key: existing.dealer_key || '',
          backlog_key: existing.backlog_key || '',
          backlog_enabled: existing.backlog_enabled !== false,
          backlog_group_enabled: existing.backlog_group_enabled === true,
          backlog_group_by: existing.backlog_group_by || '',
          dealer_columns: Array.isArray(existing.dealer_columns) ? existing.dealer_columns : [],
          backlog_columns: Array.isArray(existing.backlog_columns) ? existing.backlog_columns : []
        });
      } catch (e) {
        setErr(e?.message || String(e));
      }
    }
    load();
  }, []);

  const dealerSelected = useMemo(() => cfg.dealer_columns || [], [cfg.dealer_columns]);
  const backlogSelected = useMemo(() => cfg.backlog_columns || [], [cfg.backlog_columns]);

  function toggle(listKey, col, checked) {
    setCfg((p) => {
      const cur = Array.isArray(p[listKey]) ? p[listKey] : [];
      const next = new Set(cur);
      if (checked) next.add(col);
      else next.delete(col);
      return { ...p, [listKey]: Array.from(next) };
    });
  }

  function move(listKey, col, dir) {
    setCfg((p) => {
      const cur = Array.isArray(p[listKey]) ? p[listKey].slice(0) : [];
      const idx = cur.indexOf(col);
      if (idx < 0) return p;
      const ni = Math.max(0, Math.min(cur.length - 1, idx + dir));
      if (ni === idx) return p;
      const copy = cur.slice(0);
      const [it] = copy.splice(idx, 1);
      copy.splice(ni, 0, it);
      return { ...p, [listKey]: copy };
    });
  }

  async function save() {
    setMsg('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/page-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'dealer_view', config: cfg })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen');
      setMsg('OK: Händlerseite gespeichert.');
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Händlerseite</div>
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
        <div className="h1">Admin · Händlerseite</div>
        <div className="sub">Steuere, welche Infos auf der Händler-Detailseite angezeigt werden.</div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="primary" onClick={save} disabled={busy}>Speichern</button>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
          <span className="muted" style={{ fontSize: 12 }}>{msg}</span>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Verknüpfung Rückstand ↔ Händler</div>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <div className="label">Händler-Key (Spalte in dealers)</div>
            <select className="input" value={cfg.dealer_key} onChange={(e) => setCfg({ ...cfg, dealer_key: e.target.value })}>
              <option value="">(auto)</option>
              {dealersCols.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="label">Rückstand-Key (Spalte in backlog)</div>
            <select className="input" value={cfg.backlog_key} onChange={(e) => setCfg({ ...cfg, backlog_key: e.target.value })}>
              <option value="">(auto / default Kundennummer)</option>
              {backlogCols.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center', marginLeft: 6 }}>
            <input type="checkbox" checked={cfg.backlog_enabled !== false} onChange={(e) => setCfg({ ...cfg, backlog_enabled: e.target.checked })} />
            <span className="muted" style={{ fontSize: 12 }}>Rückstand anzeigen</span>
          </label>
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={cfg.backlog_group_enabled === true}
              onChange={(e) => setCfg({ ...cfg, backlog_group_enabled: e.target.checked })}
            />
            <span className="muted" style={{ fontSize: 12 }}>Rückstand auf Händlerseite gruppieren</span>
          </label>

          <div style={{ minWidth: 260 }}>
            <div className="label">Gruppieren nach</div>
            <select
              className="input"
              value={cfg.backlog_group_by || ''}
              onChange={(e) => setCfg({ ...cfg, backlog_group_by: e.target.value })}
              disabled={!cfg.backlog_group_enabled}
            >
              <option value="">(bitte wählen)</option>
              {backlogCols.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            Tipp: meistens <strong>Auftragsnummer</strong> / <strong>Order</strong>.
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Händlerdaten · Spalten</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Wähle die Spalten aus <strong>dealers</strong> und sortiere sie.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(dealerSelected.length ? dealerSelected : []).map((c) => (
            <div key={c} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 280, fontWeight: 700 }}>{c}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="secondary" type="button" onClick={() => move('dealer_columns', c, -1)} disabled={busy}>↑</button>
                <button className="secondary" type="button" onClick={() => move('dealer_columns', c, +1)} disabled={busy}>↓</button>
                <button className="secondary" type="button" onClick={() => toggle('dealer_columns', c, false)} disabled={busy}>Entfernen</button>
              </div>
            </div>
          ))}
        </div>
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Spalten auswählen…</summary>
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {dealersCols.map((c) => (
              <label key={c} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 10 }}>
                <input type="checkbox" checked={dealerSelected.includes(c)} onChange={(e) => toggle('dealer_columns', c, e.target.checked)} />
                <span className="muted" style={{ fontSize: 12 }}>{c}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Rückstand · Spalten</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Diese Spalten werden im Rückstandsteil auf der Händlerseite angezeigt.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(backlogSelected.length ? backlogSelected : []).map((c) => (
            <div key={c} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 280, fontWeight: 700 }}>{c}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="secondary" type="button" onClick={() => move('backlog_columns', c, -1)} disabled={busy}>↑</button>
                <button className="secondary" type="button" onClick={() => move('backlog_columns', c, +1)} disabled={busy}>↓</button>
                <button className="secondary" type="button" onClick={() => toggle('backlog_columns', c, false)} disabled={busy}>Entfernen</button>
              </div>
            </div>
          ))}
        </div>
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Spalten auswählen…</summary>
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {backlogCols.map((c) => (
              <label key={c} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 10 }}>
                <input type="checkbox" checked={backlogSelected.includes(c)} onChange={(e) => toggle('backlog_columns', c, e.target.checked)} />
                <span className="muted" style={{ fontSize: 12 }}>{c}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
