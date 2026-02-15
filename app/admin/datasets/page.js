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

function isTruthy(v) {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  return !['0', 'false', 'nein', 'no', 'n', '-'].includes(s);
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

  const [brandsMeta, setBrandsMeta] = useState({ manufacturers: [], buying_groups: [], error: '' });

  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Load manufacturers / buying groups for previews (best effort)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/brands', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Brands laden fehlgeschlagen');
        if (!alive) return;
        setBrandsMeta({ manufacturers: j?.manufacturers || [], buying_groups: j?.buying_groups || [], error: '' });
      } catch (e) {
        if (!alive) return;
        setBrandsMeta({ manufacturers: [], buying_groups: [], error: e?.message || String(e) });
      }
    })();
    return () => { alive = false; };
  }, []);

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

  const brandsCfg = useMemo(() => {
    const b = viewConfig?.brands;
    return (b && typeof b === 'object') ? b : {};
  }, [viewConfig]);

  const manufacturerMode = String(brandsCfg.manufacturer_mode || 'list');
  const manufacturerField = String(brandsCfg.manufacturer_field || '');
  const manufacturerSep = String(brandsCfg.manufacturer_separator || '[,;|]');
  const manufacturerFields = Array.isArray(brandsCfg.manufacturer_fields) ? brandsCfg.manufacturer_fields : [];
  const buyingGroupField = String(brandsCfg.buying_group_field || '');

  const mIconByKey = useMemo(() => {
    const m = new Map();
    for (const x of (brandsMeta.manufacturers || [])) {
      const k = slugKey(x?.key);
      if (k) m.set(k, x?.icon_data || '');
    }
    return m;
  }, [brandsMeta.manufacturers]);

  const bgIconByKey = useMemo(() => {
    const m = new Map();
    for (const x of (brandsMeta.buying_groups || [])) {
      const k = slugKey(x?.key);
      if (k) m.set(k, x?.icon_data || '');
    }
    return m;
  }, [brandsMeta.buying_groups]);

  const brandsPreview = useMemo(() => {
    if (dataset !== 'dealers') return [];
    const out = [];
    const re = (() => {
      try { return new RegExp(manufacturerSep); } catch { return /[,;|]/; }
    })();

    const parseM = (obj) => {
      if (manufacturerMode === 'none') return [];
      if (manufacturerMode === 'columns') {
        const ks = [];
        for (const f of (manufacturerFields || [])) {
          if (isTruthy(obj?.[f])) ks.push(slugKey(f));
        }
        return Array.from(new Set(ks)).filter(Boolean);
      }
      // list
      const raw = obj?.[manufacturerField];
      if (Array.isArray(raw)) return raw.map(slugKey).filter(Boolean);
      if (raw == null) return [];
      const parts = String(raw).split(re).map((s) => slugKey(s)).filter(Boolean);
      return Array.from(new Set(parts));
    };

    const parseBG = (obj) => {
      const raw = obj?.[buyingGroupField];
      if (raw == null) return '';
      return slugKey(raw);
    };

    for (const r of (rows || []).slice(0, 6)) {
      const obj = r?.row_data || {};
      out.push({
        row_index: r?.row_index,
        name: obj?.Name || obj?.Firmenname || obj?.Firma || obj?.Händlername || obj?.Haendlername || obj?.Shop || obj?.Store || obj?.company || `Händler #${(r?.row_index ?? 0) + 1}`,
        manufacturers: parseM(obj),
        buying_group: parseBG(obj)
      });
    }
    return out;
  }, [dataset, rows, manufacturerMode, manufacturerField, manufacturerSep, manufacturerFields, buyingGroupField]);

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

  // List grouping (used by DatasetViewer)
  const listGroupEnabled = dataset !== 'inventory' && viewConfig?.list_group_enabled === true;
  const listGroupBy = String(viewConfig?.list_group_by || '').trim();

  // Dealers geo config (used by Dealer map)
  const geoCfg = (viewConfig?.geo && typeof viewConfig.geo === 'object') ? viewConfig.geo : {};
  const geoMode = String(geoCfg?.mode || 'auto');
  const geoLatField = String(geoCfg?.lat_field || '');
  const geoLngField = String(geoCfg?.lng_field || '');

  function suggestGeoFields() {
    const cols = columns || [];
    const pick = (preds) => {
      for (const re of preds) {
        const hit = cols.find((c) => re.test(String(c)));
        if (hit) return hit;
      }
      return '';
    };
    const lat = pick([/^lat$/i, /^latitude$/i, /lat/i, /breit/i, /y$/i]);
    const lng = pick([/^(lng|lon|longitude)$/i, /(lng|lon|long)/i, /l[aä]ng/i, /x$/i]);
    setViewConfig({
      ...viewConfig,
      geo: { ...geoCfg, mode: 'manual', lat_field: lat || geoLatField, lng_field: lng || geoLngField }
    });
  }

  function swapGeoFields() {
    setViewConfig({ ...viewConfig, geo: { ...geoCfg, mode: 'manual', lat_field: geoLngField, lng_field: geoLatField } });
  }

  // Inventory filter builder
  const invFilters = useMemo(() => {
    const f = viewConfig?.filters;
    return Array.isArray(f) ? f : [];
  }, [viewConfig]);

  const [filterDraft, setFilterDraft] = useState({ field: '', op: 'contains', value: '' });

  function addFilterRule() {
    if (!filterDraft.field || !filterDraft.op) {
      setMsg('Bitte Filter-Feld und Operator wählen.');
      return;
    }
    const next = [...invFilters, { field: filterDraft.field, op: filterDraft.op, value: filterDraft.value }];
    setViewConfig({ ...viewConfig, filters: next });
    setFilterDraft({ field: '', op: 'contains', value: '' });
  }

  function removeFilterRule(i) {
    const next = invFilters.filter((_, idx) => idx !== i);
    setViewConfig({ ...viewConfig, filters: next });
  }

  function moveFilterRule(i, dir) {
    const next = invFilters.slice(0);
    const ni = Math.max(0, Math.min(next.length - 1, i + dir));
    if (ni === i) return;
    const [it] = next.splice(i, 1);
    next.splice(ni, 0, it);
    setViewConfig({ ...viewConfig, filters: next });
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

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Filter (optional)</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Zeige nur Datensätze, die <strong>alle</strong> Regeln erfüllen (UND). Regeln werden auf <code>/inventory</code> angewendet.
            </div>

            {invFilters.length ? (
              <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                {invFilters.map((f, idx) => (
                  <div key={idx} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 240, fontWeight: 700 }}>{f.field}</div>
                    <div className="muted" style={{ minWidth: 140, fontSize: 12 }}>{f.op}</div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <input
                        className="input"
                        value={String(f.value ?? '')}
                        onChange={(e) => {
                          const next = invFilters.slice(0);
                          next[idx] = { ...next[idx], value: e.target.value };
                          setViewConfig({ ...viewConfig, filters: next });
                        }}
                        placeholder="Wert"
                      />
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="secondary" type="button" onClick={() => moveFilterRule(idx, -1)} disabled={busy}>↑</button>
                      <button className="secondary" type="button" onClick={() => moveFilterRule(idx, +1)} disabled={busy}>↓</button>
                      <button className="secondary" type="button" onClick={() => removeFilterRule(idx)} disabled={busy}>Entfernen</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Keine Filterregeln gesetzt.</div>
            )}

            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Neue Filterregel</div>
              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 220 }}>
                  <div className="label">Feld</div>
                  <select className="input" value={filterDraft.field} onChange={(e) => setFilterDraft({ ...filterDraft, field: e.target.value })}>
                    <option value="">(wählen)</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 200 }}>
                  <div className="label">Operator</div>
                  <select className="input" value={filterDraft.op} onChange={(e) => setFilterDraft({ ...filterDraft, op: e.target.value })}>
                    <option value="contains">enthält</option>
                    <option value="not_contains">enthält nicht</option>
                    <option value="eq">gleich</option>
                    <option value="neq">ungleich</option>
                    <option value="starts_with">beginnt mit</option>
                    <option value="ends_with">endet mit</option>
                    <option value="gt">größer als</option>
                    <option value="gte">größer/gleich</option>
                    <option value="lt">kleiner als</option>
                    <option value="lte">kleiner/gleich</option>
                    <option value="in">in Liste (Komma)</option>
                    <option value="is_empty">ist leer</option>
                    <option value="is_not_empty">ist nicht leer</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="label">Wert</div>
                  <input
                    className="input"
                    value={filterDraft.value}
                    onChange={(e) => setFilterDraft({ ...filterDraft, value: e.target.value })}
                    placeholder="z.B. Bosch, > 0, 12345"
                    disabled={filterDraft.op === 'is_empty' || filterDraft.op === 'is_not_empty'}
                  />
                </div>
                <button className="primary" type="button" onClick={addFilterRule} disabled={busy}>Hinzufügen</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* List view config (DatasetViewer) */}
      {dataset !== 'inventory' ? (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{dsTitle} · Listenansicht</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Steuert die Darstellung auf der jeweiligen Seite (<code>/{dataset === 'dealers' ? 'database' : dataset}</code>).
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={listGroupEnabled}
                onChange={(e) => setViewConfig({ ...viewConfig, list_group_enabled: e.target.checked })}
              />
              <span className="muted" style={{ fontSize: 12 }}>Gruppierte Ansicht aktivieren</span>
            </label>

            <div style={{ minWidth: 260 }}>
              <div className="label">Gruppieren nach</div>
              <select
                className="input"
                value={listGroupBy}
                onChange={(e) => setViewConfig({ ...viewConfig, list_group_by: e.target.value })}
                disabled={!listGroupEnabled}
              >
                <option value="">(bitte wählen)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Beispiel: Rückstand nach <strong>Auftragsnummer</strong>.
            </div>
          </div>
        </div>
      ) : null}

      {/* Dealers geo config */}
      {dataset === 'dealers' ? (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Händler · Geodaten (Karte)</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Steuert, welche Spalten als <strong>Lat/Lng</strong> für die Händlerkarte verwendet werden. Wenn „Auto“ aktiv ist, wird versucht die Spalten automatisch zu erkennen.
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <input
                type="radio"
                name="geoMode"
                checked={geoMode !== 'manual'}
                onChange={() => setViewConfig({ ...viewConfig, geo: { ...geoCfg, mode: 'auto', lat_field: '', lng_field: '' } })}
              />
              <span className="muted" style={{ fontSize: 12 }}>Auto (empfohlen)</span>
            </label>
            <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <input
                type="radio"
                name="geoMode"
                checked={geoMode === 'manual'}
                onChange={() => setViewConfig({ ...viewConfig, geo: { ...geoCfg, mode: 'manual', lat_field: geoLatField, lng_field: geoLngField } })}
              />
              <span className="muted" style={{ fontSize: 12 }}>Manuell festlegen</span>
            </label>

            <button className="secondary" type="button" onClick={suggestGeoFields} disabled={busy}>
              Vorschlag setzen
            </button>
            <button className="secondary" type="button" onClick={swapGeoFields} disabled={busy || geoMode !== 'manual'}>
              Lat/Lng tauschen
            </button>
          </div>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 240 }}>
              <div className="label">Lat-Spalte</div>
              <select
                className="input"
                value={geoLatField}
                disabled={geoMode !== 'manual'}
                onChange={(e) => setViewConfig({ ...viewConfig, geo: { ...geoCfg, mode: 'manual', lat_field: e.target.value, lng_field: geoLngField } })}
              >
                <option value="">(wählen)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 240 }}>
              <div className="label">Lng-Spalte</div>
              <select
                className="input"
                value={geoLngField}
                disabled={geoMode !== 'manual'}
                onChange={(e) => setViewConfig({ ...viewConfig, geo: { ...geoCfg, mode: 'manual', lat_field: geoLatField, lng_field: e.target.value } })}
              >
                <option value="">(wählen)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Hinweis: Werte dürfen als Text mit „,“ oder „.“ kommen – die Karte akzeptiert beides. Lat muss zwischen -90..90 und Lng zwischen -180..180 liegen.
          </div>
        </div>
      ) : null}

      {/* Dealers brand icons config */}
      {dataset === 'dealers' ? (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Händler · Hersteller & Einkaufsverbände (Piktogramme)</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Hier stellst du ein, aus welchen Spalten die App die Hersteller‑Keys und den Einkaufsverband liest. Die Keys sollten zu den Einträgen unter <code>Admin → Hersteller & Einkaufsverbände</code> passen.
          </div>

          {brandsMeta.error ? (
            <div className="error" style={{ marginBottom: 10 }}>
              Brands konnten nicht geladen werden: {brandsMeta.error}
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Hinweis: Falls die Tabellen noch nicht existieren, bitte im <code>Admin → Installer</code> das Script <strong>04 manufacturers + buying groups</strong> ausführen.
              </div>
            </div>
          ) : null}

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 220 }}>
              <div className="label">Hersteller‑Erkennung</div>
              <select
                className="input"
                value={manufacturerMode}
                onChange={(e) => setViewConfig({
                  ...viewConfig,
                  brands: {
                    ...brandsCfg,
                    manufacturer_mode: e.target.value
                  }
                })}
              >
                <option value="list">Liste in einer Spalte</option>
                <option value="columns">Mehrere Hersteller‑Spalten (Ja/Nein)</option>
                <option value="none">Keine Hersteller anzeigen</option>
              </select>
            </div>

            {manufacturerMode === 'list' ? (
              <>
                <div style={{ minWidth: 260 }}>
                  <div className="label">Hersteller‑Spalte (z.B. "manufacturer_keys")</div>
                  <select
                    className="input"
                    value={manufacturerField}
                    onChange={(e) => setViewConfig({ ...viewConfig, brands: { ...brandsCfg, manufacturer_mode: 'list', manufacturer_field: e.target.value } })}
                  >
                    <option value="">(wählen)</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 220 }}>
                  <div className="label">Trennzeichen (Regex)</div>
                  <input
                    className="input"
                    value={manufacturerSep}
                    onChange={(e) => setViewConfig({ ...viewConfig, brands: { ...brandsCfg, manufacturer_mode: 'list', manufacturer_separator: e.target.value } })}
                    placeholder="[,;|]"
                  />
                </div>
              </>
            ) : null}

            {manufacturerMode === 'columns' ? (
              <div style={{ minWidth: 320, flex: 1 }}>
                <div className="label">Hersteller‑Spalten (Wahr/Ja = aktiv)</div>
                <div className="card" style={{ padding: 10, maxHeight: 180, overflow: 'auto' }}>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {columns.map((c) => (
                      <label key={c} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 10 }}>
                        <input
                          type="checkbox"
                          checked={manufacturerFields.includes(c)}
                          onChange={(e) => {
                            const next = new Set(manufacturerFields);
                            if (e.target.checked) next.add(c); else next.delete(c);
                            setViewConfig({ ...viewConfig, brands: { ...brandsCfg, manufacturer_mode: 'columns', manufacturer_fields: Array.from(next) } });
                          }}
                        />
                        <span className="muted" style={{ fontSize: 12 }}>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 260 }}>
              <div className="label">Einkaufsverband‑Spalte (optional)</div>
              <select
                className="input"
                value={buyingGroupField}
                onChange={(e) => setViewConfig({ ...viewConfig, brands: { ...brandsCfg, buying_group_field: e.target.value } })}
              >
                <option value="">(keine)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Vorschau unten zeigt, welche Keys daraus gelesen werden.
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Vorschau</div>
            {!brandsPreview.length ? (
              <div className="muted" style={{ fontSize: 12 }}>Keine Daten für Vorschau (dealers noch leer).</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {brandsPreview.map((p) => (
                  <div key={p.row_index} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      {p.buying_group ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {bgIconByKey.get(p.buying_group) ? (
                            <img alt={p.buying_group} src={bgIconByKey.get(p.buying_group)} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>{p.buying_group}</span>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>(kein Einkaufsverband)</span>
                      )}
                    </div>

                    <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                        {(p.manufacturers || []).length ? (p.manufacturers || []).slice(0, 10).map((k) => (
                          mIconByKey.get(k) ? (
                            <img key={k} alt={k} title={k} src={mIconByKey.get(k)} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          ) : (
                            <span key={k} className="muted" style={{ fontSize: 12 }}>{k}</span>
                          )
                        )) : <span className="muted" style={{ fontSize: 12 }}>(keine Hersteller)</span>}
                      </div>
                      <a className="secondary" href={`/dealers/${p.row_index}`} style={{ textDecoration: 'none', padding: '6px 10px', fontSize: 12 }}>
                        Öffnen
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
