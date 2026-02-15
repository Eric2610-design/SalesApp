'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCell, inferTypeFromSamples } from '@/lib/typeDetect';

const DATASETS = [
  { key: 'dealers', title: 'Händler' },
  { key: 'backlog', title: 'Rückstand' },
  { key: 'inventory', title: 'Lager' }
];

function normType(t) {
  const x = String(t || '').trim();
  return x || 'text';
}

function collectColumns(rows, maxRows = 80) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj || {}).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

function guessTypeFromRows(rows, col) {
  const sample = [];
  for (const r of (rows || []).slice(0, 120)) {
    const v = (r?.row_data || {})[col];
    if (v == null) continue;
    const s = String(v);
    if (s.trim() === '') continue;
    sample.push(v);
    if (sample.length >= 12) break;
  }
  return inferTypeFromSamples(sample, col);
}

export default function AdminDatasetsPage() {
  const [err, setErr] = useState('');
  const [dataset, setDataset] = useState('dealers');
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [imp, setImp] = useState(null);

  const [displayCols, setDisplayCols] = useState({});
  const [displayOrder, setDisplayOrder] = useState([]);
  const [colTypes, setColTypes] = useState({});
  const [colLabels, setColLabels] = useState({});
  const [joins, setJoins] = useState([]);
  const [viewConfig, setViewConfig] = useState({});

  const [otherCols, setOtherCols] = useState({ dealers: [], backlog: [], inventory: [] });

  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // dataset from query param
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ds = url.searchParams.get('dataset');
      if (ds && ['dealers', 'backlog', 'inventory'].includes(ds)) setDataset(ds);
    } catch {}
  }, []);

  async function ensureOtherColumns() {
    // best effort; only fetch once
    if (otherCols.dealers.length && otherCols.backlog.length && otherCols.inventory.length) return;
    try {
      const [d, b, i] = await Promise.all([
        fetch('/api/data/dealers?limit=80', { cache: 'no-store' }).then((r) => r.json().catch(() => ({}))),
        fetch('/api/data/backlog?limit=80', { cache: 'no-store' }).then((r) => r.json().catch(() => ({}))),
        fetch('/api/data/inventory?limit=80', { cache: 'no-store' }).then((r) => r.json().catch(() => ({})))
      ]);
      setOtherCols({
        dealers: collectColumns(d?.rows || []),
        backlog: collectColumns(b?.rows || []),
        inventory: collectColumns(i?.rows || [])
      });
    } catch {
      // ignore
    }
  }

  async function loadAll(ds = dataset) {
    setErr('');
    setMsg('');

    const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const meJ = await meRes.json().catch(() => ({}));
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

    try {
      const dataRes = await fetch(`/api/data/${ds}?limit=80`, { cache: 'no-store' });
      const dataJ = await dataRes.json().catch(() => ({}));
      if (!dataRes.ok) throw new Error(dataJ?.error || 'Daten laden fehlgeschlagen');

      setRows(dataJ.rows || []);
      setImp(dataJ.import || null);

      const scRes = await fetch(`/api/admin/schema?dataset=${encodeURIComponent(ds)}`, { cache: 'no-store' });
      const scJ = await scRes.json().catch(() => ({}));
      if (!scRes.ok) throw new Error(scJ?.error || 'Schema laden fehlgeschlagen');
      setSchema(scJ.schema || null);

      const cols = collectColumns(dataJ.rows || []);

      const baseDisplay = Array.isArray(scJ.schema?.display_columns)
        ? scJ.schema.display_columns
        : (Array.isArray(dataJ.import?.display_columns) ? dataJ.import.display_columns : cols.slice(0, 10));

      const disp = {};
      for (const c of cols) disp[c] = baseDisplay.includes(c);
      for (const c of baseDisplay) if (!(c in disp)) disp[c] = true;

      // ordered
      const ordered = baseDisplay.filter((c) => disp[c]);
      // Add any checked but not in baseDisplay
      for (const c of Object.keys(disp)) if (disp[c] && !ordered.includes(c)) ordered.push(c);

      const types = { ...(dataJ.import?.column_types || {}), ...(scJ.schema?.column_types || {}) };
      const labels = { ...(scJ.schema?.column_labels || {}) };
      const allCols = Array.from(new Set([...cols, ...Object.keys(types || {}), ...ordered]));
      for (const c of allCols) {
        if (!types[c]) types[c] = guessTypeFromRows(dataJ.rows || [], c);
      }

      setDisplayCols(disp);
      setDisplayOrder(ordered);
      setColTypes(types);
      setColLabels(labels);
      setJoins(Array.isArray(scJ.schema?.joins) ? scJ.schema.joins : []);
      setViewConfig(scJ.schema?.view_config && typeof scJ.schema.view_config === 'object' ? scJ.schema.view_config : {});

      // Fetch other datasets columns for join picker
      ensureOtherColumns();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    loadAll(dataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  const dsTitle = useMemo(() => DATASETS.find((d) => d.key === dataset)?.title || dataset, [dataset]);

  const columns = useMemo(() => {
    const cols = collectColumns(rows);
    const set = new Set([
      ...cols,
      ...Object.keys(displayCols || {}),
      ...Object.keys(colTypes || {}),
      ...Object.keys(colLabels || {}),
      ...(Array.isArray(schema?.display_columns) ? schema.display_columns : []),
      ...displayOrder
    ]);
    // include virtual columns from joins
    for (const j of (joins || [])) {
      for (const c of (j?.columns || [])) {
        if (c?.as) set.add(c.as);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, displayCols, colTypes, colLabels, schema, displayOrder, joins]);

  const selectedDisplay = useMemo(() => {
    const order = displayOrder.filter((c) => displayCols?.[c]);
    const missing = columns.filter((c) => displayCols?.[c] && !order.includes(c));
    return [...order, ...missing];
  }, [displayOrder, displayCols, columns]);

  function setAllDisplay(v) {
    const next = { ...displayCols };
    columns.forEach((c) => (next[c] = v));
    setDisplayCols(next);
    setDisplayOrder(v ? columns.slice(0) : []);
  }

  function toggleDisplay(c, v) {
    const next = { ...displayCols, [c]: v };
    setDisplayCols(next);
    setDisplayOrder((prev) => {
      const cur = prev.slice(0);
      const has = cur.includes(c);
      if (v && !has) cur.push(c);
      if (!v && has) return cur.filter((x) => x !== c);
      return cur;
    });
  }

  function moveDisplay(c, dir) {
    setDisplayOrder((prev) => {
      const list = prev.filter((x) => displayCols?.[x]);
      const idx = list.indexOf(c);
      if (idx < 0) return prev;
      const nextIdx = Math.max(0, Math.min(list.length - 1, idx + dir));
      if (nextIdx === idx) return prev;
      const swapped = list.slice(0);
      const [item] = swapped.splice(idx, 1);
      swapped.splice(nextIdx, 0, item);
      // merge back with any non-selected that might still be in prev
      const rest = prev.filter((x) => !swapped.includes(x));
      return [...swapped, ...rest];
    });
  }

  async function save() {
    setMsg('');
    setBusy(true);
    try {
      const payload = {
        dataset,
        display_columns: selectedDisplay,
        import_columns: Array.isArray(imp?.selected_columns) ? imp.selected_columns : null,
        column_types: colTypes || {},
        column_labels: colLabels || {},
        joins: Array.isArray(joins) ? joins : [],
        view_config: viewConfig || {}
      };

      const res = await fetch('/api/admin/schema', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen');
      setMsg('OK: Einstellungen gespeichert.');
      await loadAll(dataset);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // Join UI helpers (Backlog only for now)
  const [joinDraft, setJoinDraft] = useState({
    source_dataset: 'dealers',
    local_key: '',
    source_key: '',
    source_col: '',
    as: '',
    label: '',
    type: 'text'
  });

  function addJoinColumn() {
    const d = joinDraft;
    if (!d.local_key || !d.source_key || !d.source_col) {
      setMsg('Bitte Join-Key + Quellspalte auswählen.');
      return;
    }
    const as = (d.as || `${d.source_dataset}_${d.source_col}`)
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .slice(0, 64);
    const label = d.label || d.source_col;
    const nextJoins = [...(joins || []), {
      source_dataset: d.source_dataset,
      local_key: d.local_key,
      source_key: d.source_key,
      columns: [{ source_col: d.source_col, as, label, type: d.type || 'text' }]
    }];
    setJoins(nextJoins);
    // auto add to display
    toggleDisplay(as, true);
    setColLabels((p) => ({ ...p, [as]: label }));
    setColTypes((p) => ({ ...p, [as]: d.type || 'text' }));
    setJoinDraft({ ...joinDraft, source_col: '', as: '', label: '' });
  }

  function removeJoin(idx) {
    const j = joins?.[idx];
    const asKeys = (j?.columns || []).map((c) => c?.as).filter(Boolean);
    setJoins((prev) => (prev || []).filter((_, i) => i !== idx));
    // remove from display
    for (const k of asKeys) toggleDisplay(k, false);
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Dataset Einstellungen</div>
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
        <div className="h1">Admin · Dataset Einstellungen</div>
        <div className="sub">Spalten, Reihenfolge, Namen, Typen, Vorschau (und optional Joins/Ansicht).</div>
      </div>

      {msg ? (
        <div className={msg.startsWith('OK') ? 'card' : 'error'}>{msg}</div>
      ) : null}

      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 240 }}>
            <div className="label">Dataset</div>
            <select className="input" value={dataset} onChange={(e) => setDataset(e.target.value)}>
              {DATASETS.map((d) => (
                <option key={d.key} value={d.key}>{d.title}</option>
              ))}
            </select>
          </div>
          <div className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
            Letzter Import: {imp?.filename ? <strong>{imp.filename}</strong> : <span>—</span>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="secondary" type="button" onClick={() => setAllDisplay(true)} disabled={busy}>Anzeige: Alle</button>
          <button className="secondary" type="button" onClick={() => setAllDisplay(false)} disabled={busy}>Anzeige: Keine</button>
          <button className="primary" onClick={save} disabled={busy}>Speichern</button>
        </div>
      </div>

      {/* Inventory view config */}
      {dataset === 'inventory' ? (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Lager · Ansicht</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Optional: Standard-Ansicht für <code>/inventory</code> festlegen.
          </div>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 220 }}>
              <div className="label">Modus</div>
              <select className="input" value={String(viewConfig?.mode || 'cards')} onChange={(e) => setViewConfig({ ...viewConfig, mode: e.target.value })}>
                <option value="cards">Kacheln (gruppiert)</option>
                <option value="list">Liste</option>
              </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <div className="label">Gruppieren nach</div>
              <select className="input" value={String(viewConfig?.group_by || '')} onChange={(e) => setViewConfig({ ...viewConfig, group_by: e.target.value })}>
                <option value="">(bitte wählen)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="label">Welche Felder im Kachel-Inhalt?</div>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
              {columns.slice(0, 40).map((c) => {
                const list = Array.isArray(viewConfig?.item_fields) ? viewConfig.item_fields : [];
                const checked = list.includes(c);
                return (
                  <label key={c} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(list);
                        if (e.target.checked) next.add(c);
                        else next.delete(c);
                        setViewConfig({ ...viewConfig, item_fields: Array.from(next) });
                      }}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>{c}</span>
                  </label>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Tipp: Für dein Beispiel <em>Modell</em> als Gruppe und <em>Artikelnummer</em> als Inhalt.
            </div>
          </div>
        </div>
      ) : null}

      {/* Backlog join config */}
      {dataset === 'backlog' ? (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Rückstand · Zusatzinfos (Join)</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Damit kannst du Spalten aus <strong>Händler</strong> oder <strong>Lager</strong> in den Rückstand holen (z.B. Telefon, Website, Buying-Group).
            Der Join passiert beim Laden der Seite.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {(joins || []).map((j, idx) => (
              <div key={idx} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 800 }}>
                    {j.source_dataset} · {j.local_key} ↔ {j.source_key}
                  </div>
                  <button className="secondary" onClick={() => removeJoin(idx)} disabled={busy}>Entfernen</button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {(j.columns || []).map((c) => `${c.as} ← ${c.source_col}`).join(' · ')}
                </div>
              </div>
            ))}

            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Neue Zusatzspalte hinzufügen</div>
              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 180 }}>
                  <div className="label">Quelle</div>
                  <select className="input" value={joinDraft.source_dataset} onChange={(e) => setJoinDraft({ ...joinDraft, source_dataset: e.target.value, source_key: '', source_col: '' })}>
                    <option value="dealers">Händler</option>
                    <option value="inventory">Lager</option>
                  </select>
                </div>
                <div style={{ minWidth: 180 }}>
                  <div className="label">Rückstand-Key</div>
                  <select className="input" value={joinDraft.local_key} onChange={(e) => setJoinDraft({ ...joinDraft, local_key: e.target.value })}>
                    <option value="">(wählen)</option>
                    {collectColumns(rows).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 180 }}>
                  <div className="label">Quelle-Key</div>
                  <select className="input" value={joinDraft.source_key} onChange={(e) => setJoinDraft({ ...joinDraft, source_key: e.target.value })}>
                    <option value="">(wählen)</option>
                    {(joinDraft.source_dataset === 'dealers' ? otherCols.dealers : otherCols.inventory).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 220 }}>
                  <div className="label">Quellspalte</div>
                  <select className="input" value={joinDraft.source_col} onChange={(e) => setJoinDraft({ ...joinDraft, source_col: e.target.value })}>
                    <option value="">(wählen)</option>
                    {(joinDraft.source_dataset === 'dealers' ? otherCols.dealers : otherCols.inventory).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 150 }}>
                  <div className="label">Typ</div>
                  <select className="input" value={joinDraft.type} onChange={(e) => setJoinDraft({ ...joinDraft, type: e.target.value })}>
                    <option value="text">text</option>
                    <option value="number">zahl</option>
                    <option value="date">datum</option>
                    <option value="datetime">datum+uhrzeit</option>
                    <option value="time">uhrzeit</option>
                    <option value="boolean">ja/nein</option>
                    <option value="leer">leer</option>
                  </select>
                </div>
              </div>

              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="label">Alias (Spaltenname in der Ansicht)</div>
                  <input className="input" value={joinDraft.as} onChange={(e) => setJoinDraft({ ...joinDraft, as: e.target.value })} placeholder="z.B. dealer_phone" />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="label">Label (Überschrift)</div>
                  <input className="input" value={joinDraft.label} onChange={(e) => setJoinDraft({ ...joinDraft, label: e.target.value })} placeholder="z.B. Telefon" />
                </div>
                <button className="primary" onClick={addJoinColumn} disabled={busy}>Hinzufügen</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Display order + labels */}
      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{dsTitle} · Anzeige-Reihenfolge & Namen</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Reihenfolge gilt für die Tabellenübersicht. Labels sind optional.
        </div>

        {!selectedDisplay.length ? (
          <div className="muted">Keine Anzeigespalten ausgewählt.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {selectedDisplay.map((c) => (
              <div key={c} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 260, fontWeight: 700 }}>{c}</div>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 240 }}
                  value={colLabels?.[c] || ''}
                  onChange={(e) => setColLabels({ ...colLabels, [c]: e.target.value })}
                  placeholder="(optional) Spaltenüberschrift"
                />
                <div className="row" style={{ gap: 6 }}>
                  <button className="secondary" type="button" onClick={() => moveDisplay(c, -1)} disabled={busy}>↑</button>
                  <button className="secondary" type="button" onClick={() => moveDisplay(c, +1)} disabled={busy}>↓</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Column selection & type overrides */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Spalten</div>
        <table className="table" style={{ minWidth: 1040 }}>
          <thead>
            <tr>
              <th>Spalte</th>
              <th style={{ width: 140 }}>Anzeige</th>
              <th style={{ width: 220 }}>Typ</th>
              <th style={{ width: 260 }}>Label (optional)</th>
              <th>Beispiel (formatiert)</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => {
              const ex = rows?.[0]?.row_data?.[c];
              return (
                <tr key={c}>
                  <td><div style={{ fontWeight: 700 }}>{c}</div></td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!displayCols?.[c]}
                        onChange={(e) => toggleDisplay(c, e.target.checked)}
                      />
                      <span className="muted" style={{ fontSize: 12 }}>{displayCols?.[c] ? 'ja' : 'nein'}</span>
                    </label>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      value={normType(colTypes?.[c] || 'text')}
                      onChange={(e) => setColTypes({ ...colTypes, [c]: e.target.value })}
                    >
                      <option value="text">text</option>
                      <option value="number">zahl</option>
                      <option value="date">datum</option>
                      <option value="datetime">datum+uhrzeit</option>
                      <option value="time">uhrzeit</option>
                      <option value="date_excel">datum (Excel-Zahl)</option>
                      <option value="boolean">ja/nein</option>
                      <option value="leer">leer</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      value={colLabels?.[c] || ''}
                      onChange={(e) => setColLabels({ ...colLabels, [c]: e.target.value })}
                      placeholder="(optional)"
                    />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatCell(ex, colTypes?.[c])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Vorschau</div>
        {!rows?.length ? (
          <div className="muted">Noch keine Daten – importiere zuerst über Admin → Datenimport.</div>
        ) : (
          <>
            <table className="table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  {selectedDisplay.slice(0, 12).map((c) => <th key={c}>{(colLabels?.[c] || '').trim() || c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.row_index}>
                    <td className="muted">{r.row_index + 1}</td>
                    {selectedDisplay.slice(0, 12).map((c) => (
                      <td key={c}>{formatCell((r.row_data || {})[c], colTypes?.[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Vorschau zeigt max. 12 Spalten und 10 Zeilen. Join-Spalten erscheinen nach dem Speichern (und Neuladen der Datenseite).
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        <a className="secondary" href={`/${dataset === 'dealers' ? 'database' : dataset}`} style={{ textDecoration: 'none' }}>Zur Seite</a>
        <button className="secondary" onClick={() => loadAll(dataset)} disabled={busy}>Neu laden</button>
      </div>
    </div>
  );
}
