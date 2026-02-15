'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';
import { toAoaFromFile } from '../../../lib/fileToAoa';

const IMPORT_TYPES = [
  { key: 'dealers', title: 'Händler', desc: 'Import in Tabelle public.dealers (Upsert auf country_code + customer_number).' },
  { key: 'backlog', title: 'Auftragsrückstand', desc: 'Import in backlog_imports/backlog_rows (neuester Import ersetzt den alten).' },
  { key: 'inventory', title: 'Lagerbestand', desc: 'Import in inventory_imports/inventory_rows (neuester Import ersetzt den alten).' },
  { key: 'users_ad', title: 'Benutzer (Aussendienst)', desc: 'Bulk-Anlage/Update von AD-Profilen (app_users). Email wird @flyer-bikes.com erzeugt.' },
];

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]+/g, '');
}

function guessMapping(headers, synonyms) {
  const h = headers.map((x) => String(x || ''));
  const nh = h.map(norm);
  for (const syn of synonyms) {
    const i = nh.indexOf(norm(syn));
    if (i >= 0) return i;
  }
  return -1;
}

function makeColumnNames(count) {
  const cols = [];
  for (let i = 0; i < count; i++) cols.push(`Spalte ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`);
  return cols;
}

export default function AdminImportsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [typeKey, setTypeKey] = useState('dealers');

  const [file, setFile] = useState(null);
  const [aoa, setAoa] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);

  // mapping state
  const [map, setMap] = useState({});
  const [displayCols, setDisplayCols] = useState([]);

  // backlog/inventory special
  const [customerCol, setCustomerCol] = useState(-1);
  const [skuCol, setSkuCol] = useState(-1);
  const [qtyCol, setQtyCol] = useState(-1);

  // users special
  const [emailMode, setEmailMode] = useState('initial_lastname');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const type = IMPORT_TYPES.find((t) => t.key === typeKey) || IMPORT_TYPES[0];

  async function loadMe() {
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const token = sess?.access_token;
      if (!token) throw new Error('Bitte einloggen');

      const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Konnte Profil nicht laden');
      setMe(j);
    } catch (e) {
      setMe(null);
      setError(e?.message || String(e));
    }
  }

  useEffect(() => { loadMe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // reset when type changes
    setFile(null);
    setAoa([]);
    setHeaders([]);
    setRows([]);
    setMap({});
    setDisplayCols([]);
    setCustomerCol(-1);
    setSkuCol(-1);
    setQtyCol(-1);
    setResult(null);
    setError('');
    setProgress('');
  }, [typeKey]);

  async function onPickFile(f) {
    setError('');
    setResult(null);
    setProgress('');
    setFile(f || null);
    if (!f) { setAoa([]); return; }

    setBusy(true);
    try {
      const a = await toAoaFromFile(f);
      if (!Array.isArray(a) || !a.length) throw new Error('Datei enthält keine Daten');
      setAoa(a);
    } catch (e) {
      setAoa([]);
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!aoa.length) return;

    const maxCols = Math.max(...aoa.map((r) => (Array.isArray(r) ? r.length : 0)));
    const rawHeader = hasHeader ? (aoa[0] || []) : makeColumnNames(maxCols);
    const hdr = rawHeader.map((c, idx) => {
      const s = String(c ?? '').trim();
      return s || (hasHeader ? `Spalte ${idx + 1}` : rawHeader[idx]);
    });

    const dataRows = hasHeader ? aoa.slice(1) : aoa;
    setHeaders(hdr);
    setRows(dataRows);

    // default: display all columns
    setDisplayCols(hdr);

    // default mappings per type
    if (typeKey === 'dealers') {
      const m = {};
      m.country_code = guessMapping(hdr, ['country', 'country_code', 'land', 'lk', 'laenderkuerzel']);
      m.customer_number = guessMapping(hdr, ['kundennummer', 'kunden-nr', 'customer_number', 'customer', 'kdnr', 'nr']);
      m.name = guessMapping(hdr, ['kunde', 'name', 'haendler', 'dealer']);
      m.street = guessMapping(hdr, ['strasse', 'straße', 'street']);
      m.house_number = guessMapping(hdr, ['hausnummer', 'house_number', 'nr']);
      m.postal_code = guessMapping(hdr, ['plz', 'postal_code', 'zip']);
      m.city = guessMapping(hdr, ['ort', 'city', 'stadt']);
      setMap(m);
    }

    if (typeKey === 'backlog') {
      setCustomerCol(guessMapping(hdr, ['kundennummer', 'customer_number', 'kdnr', 'kunde']));
    }

    if (typeKey === 'inventory') {
      setSkuCol(guessMapping(hdr, ['sku', 'artikel', 'artikelnummer', 'artnr', 'item']));
      setQtyCol(guessMapping(hdr, ['qty', 'menge', 'bestand', 'stock', 'verfuegbar']));
    }

    if (typeKey === 'users_ad') {
      const m = {};
      m.ad_key = guessMapping(hdr, ['ad_key', 'adkey', 'key', 'id']);
      m.first_name = guessMapping(hdr, ['first_name', 'vorname', 'firstname']);
      m.last_name = guessMapping(hdr, ['last_name', 'nachname', 'lastname']);
      m.country_code = guessMapping(hdr, ['country', 'country_code', 'land', 'lk']);
      setMap(m);
    }
  }, [aoa, hasHeader, typeKey]);

  function setMapField(field, idx) {
    setMap((prev) => ({ ...prev, [field]: idx }));
  }

  function toggleDisplayCol(col) {
    setDisplayCols((prev) => {
      const has = prev.includes(col);
      if (has) return prev.filter((c) => c !== col);
      return [...prev, col];
    });
  }

  function previewMappedRows(max = 20) {
    const out = [];
    const take = Math.min(max, rows.length);
    for (let i = 0; i < take; i++) {
      const r = rows[i] || [];
      if (typeKey === 'dealers') {
        out.push({
          country_code: map.country_code >= 0 ? String(r[map.country_code] || '').trim() : '',
          customer_number: map.customer_number >= 0 ? String(r[map.customer_number] || '').trim() : '',
          name: map.name >= 0 ? String(r[map.name] || '').trim() : '',
          street: map.street >= 0 ? String(r[map.street] || '').trim() : '',
          house_number: map.house_number >= 0 ? String(r[map.house_number] || '').trim() : '',
          postal_code: map.postal_code >= 0 ? String(r[map.postal_code] || '').trim() : '',
          city: map.city >= 0 ? String(r[map.city] || '').trim() : '',
        });
      } else if (typeKey === 'users_ad') {
        out.push({
          ad_key: map.ad_key >= 0 ? String(r[map.ad_key] || '').trim() : '',
          first_name: map.first_name >= 0 ? String(r[map.first_name] || '').trim() : '',
          last_name: map.last_name >= 0 ? String(r[map.last_name] || '').trim() : '',
          country_code: map.country_code >= 0 ? String(r[map.country_code] || '').trim().toUpperCase() : '',
        });
      } else {
        // backlog/inventory preview: show selected display columns
        const obj = {};
        for (const col of displayCols) {
          const idx = headers.indexOf(col);
          obj[col] = idx >= 0 ? String(r[idx] ?? '').trim() : '';
        }
        out.push(obj);
      }
    }
    return out;
  }

  async function requireAdminToken() {
    const sess = (await supabase.auth.getSession()).data.session;
    const token = sess?.access_token;
    if (!token) throw new Error('Bitte einloggen');
    if (!me?.isAdmin) throw new Error('Nur Admin darf Imports ausführen');
    return token;
  }

  async function doImport() {
    setBusy(true);
    setError('');
    setResult(null);
    setProgress('');

    try {
      const token = await requireAdminToken();
      if (!rows.length) throw new Error('Keine Datenzeilen');

      if (typeKey === 'dealers') {
        const reqFields = ['country_code', 'customer_number'];
        for (const f of reqFields) {
          if (!(map?.[f] >= 0)) throw new Error(`Mapping fehlt: ${f}`);
        }

        const payload = [];
        for (const r of rows) {
          const obj = {
            country_code: String(r[map.country_code] || '').trim().toUpperCase(),
            customer_number: String(r[map.customer_number] || '').trim(),
            name: map.name >= 0 ? String(r[map.name] || '').trim() : null,
            street: map.street >= 0 ? String(r[map.street] || '').trim() : null,
            house_number: map.house_number >= 0 ? String(r[map.house_number] || '').trim() : null,
            postal_code: map.postal_code >= 0 ? String(r[map.postal_code] || '').trim() : null,
            city: map.city >= 0 ? String(r[map.city] || '').trim() : null,
          };
          if (!obj.country_code || !obj.customer_number) continue;
          payload.push(obj);
        }

        const chunkSize = 500;
        let inserted = 0, updated = 0, skipped = 0;
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          setProgress(`Importiere Händler… ${Math.min(i + chunk.length, payload.length)}/${payload.length}`);
          const res = await fetch('/api/dealers/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ rows: chunk }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j?.error || 'Import fehlgeschlagen');
          inserted += Number(j.inserted || 0);
          updated += Number(j.updated || 0);
          skipped += Number(j.skipped || 0);
        }

        setResult({ ok: true, inserted, updated, skipped, total: payload.length });
      }

      if (typeKey === 'backlog') {
        if (!(customerCol >= 0)) throw new Error('Bitte Kundennummer-Spalte wählen');
        const cols = headers;

        // Start
        setProgress('Backlog: Start…');
        const startRes = await fetch('/api/backlog/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            phase: 'start',
            filename: file?.name || null,
            has_header: hasHeader,
            columns: cols,
            customer_col_index: customerCol
          })
        });
        const startJ = await startRes.json();
        if (!startRes.ok) throw new Error(startJ?.error || 'Backlog Start fehlgeschlagen');

        const importId = startJ.import_id;

        // Chunk
        const chunkSize = 400;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          setProgress(`Backlog: Import… ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
          const cRes = await fetch('/api/backlog/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({
              phase: 'chunk',
              import_id: importId,
              row_start_index: i,
              rows: chunk,
              customer_col_index: customerCol
            })
          });
          const cJ = await cRes.json();
          if (!cRes.ok) throw new Error(cJ?.error || 'Backlog Chunk fehlgeschlagen');
          inserted += Number(cJ.inserted || 0);
        }

        // Finish
        setProgress('Backlog: Finish…');
        const finishRes = await fetch('/api/backlog/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            phase: 'finish',
            import_id: importId,
            display_columns: displayCols
          })
        });
        const finishJ = await finishRes.json();
        if (!finishRes.ok) throw new Error(finishJ?.error || 'Backlog Finish fehlgeschlagen');

        setResult({ ok: true, import_id: importId, rows_inserted: finishJ.rows_inserted ?? inserted });
      }

      if (typeKey === 'inventory') {
        if (!(skuCol >= 0)) throw new Error('Bitte SKU-Spalte wählen');
        if (!(qtyCol >= 0)) throw new Error('Bitte Menge/Qty-Spalte wählen');
        const cols = headers;

        setProgress('Inventory: Start…');
        const startRes = await fetch('/api/inventory/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            phase: 'start',
            filename: file?.name || null,
            has_header: hasHeader,
            columns: cols
          })
        });
        const startJ = await startRes.json();
        if (!startRes.ok) throw new Error(startJ?.error || 'Inventory Start fehlgeschlagen');
        const importId = startJ.import_id;

        const chunkSize = 400;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          setProgress(`Inventory: Import… ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
          const cRes = await fetch('/api/inventory/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({
              phase: 'chunk',
              import_id: importId,
              row_start_index: i,
              rows: chunk,
              sku_col_index: skuCol,
              qty_col_index: qtyCol
            })
          });
          const cJ = await cRes.json();
          if (!cRes.ok) throw new Error(cJ?.error || 'Inventory Chunk fehlgeschlagen');
          inserted += Number(cJ.inserted || 0);
        }

        setProgress('Inventory: Finish…');
        const finishRes = await fetch('/api/inventory/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            phase: 'finish',
            import_id: importId,
            display_columns: displayCols
          })
        });
        const finishJ = await finishRes.json();
        if (!finishRes.ok) throw new Error(finishJ?.error || 'Inventory Finish fehlgeschlagen');

        setResult({ ok: true, import_id: importId, rows_inserted: finishJ.rows_inserted ?? inserted });
      }

      if (typeKey === 'users_ad') {
        const reqFields = ['ad_key', 'first_name', 'last_name', 'country_code'];
        for (const f of reqFields) {
          if (!(map?.[f] >= 0)) throw new Error(`Mapping fehlt: ${f}`);
        }

        const payload = [];
        for (const r of rows) {
          const obj = {
            ad_key: String(r[map.ad_key] || '').trim(),
            first_name: String(r[map.first_name] || '').trim(),
            last_name: String(r[map.last_name] || '').trim(),
            country_code: String(r[map.country_code] || '').trim().toUpperCase(),
          };
          if (!obj.ad_key || !obj.first_name || !obj.last_name || !obj.country_code) continue;
          payload.push(obj);
        }

        setProgress(`AD Benutzer importieren… ${payload.length} Zeilen`);
        const res = await fetch('/api/users/bulk-create-ad', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: payload, email_mode: emailMode }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'AD Import fehlgeschlagen');

        setResult(j);
      }

      setProgress('Fertig ✅');
    } catch (e) {
      setError(e?.message || String(e));
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  const preview = aoa.length ? previewMappedRows(12) : [];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>📥 Upload Center</h1>
          <div className="sub">Zentraler Import im Admin. Apps bleiben „Anzeige-only“.</div>
        </div>
        <a className="secondary" href="/admin" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>
          Admin
        </a>
      </div>

      {!me ? (
        <div className="sub" style={{ marginTop: 12 }}>Lade Profil…</div>
      ) : !me.isAdmin ? (
        <div className="error" style={{ marginTop: 12 }}>
          Nur Admin darf Imports ausführen.
        </div>
      ) : null}

      {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
      {progress ? <div className="sub" style={{ marginTop: 12 }}>{progress}</div> : null}
      {result ? (
        <pre className="sub" style={{ marginTop: 12, background: 'rgba(17,24,39,.04)', padding: 12, borderRadius: 14, overflowX: 'auto' }}>
{JSON.stringify(result, null, 2)}
        </pre>
      ) : null}

      <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 240 }}>
          <div className="sub">Import-Typ</div>
          <select value={typeKey} onChange={(e) => setTypeKey(e.target.value)} style={{ width: '100%', padding: '10px 12px' }}>
            {IMPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
          <div className="sub" style={{ marginTop: 6 }}>{type?.desc}</div>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="sub">Datei</div>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => onPickFile(e.target.files?.[0])} />
          <label className="sub" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            Erste Zeile enthält Header
          </label>
          <div className="sub" style={{ marginTop: 6 }}>
            {file ? <>Datei: <b>{file.name}</b> · Zeilen: <b>{rows.length}</b> · Spalten: <b>{headers.length}</b></> : 'Bitte Datei auswählen.'}
          </div>
        </div>
      </div>

      {headers.length ? (
        <>
          <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid rgba(17,24,39,.08)' }} />

          {typeKey === 'dealers' ? (
            <div>
              <h2 className="h2">Mapping (Händler)</h2>
              <div className="sub">Pflicht: <b>country_code</b> + <b>customer_number</b></div>
              <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
                {[
                  ['country_code', 'Land (country_code) *'],
                  ['customer_number', 'Kundennummer *'],
                  ['name', 'Kunde / Name'],
                  ['street', 'Straße'],
                  ['house_number', 'Hausnummer'],
                  ['postal_code', 'PLZ'],
                  ['city', 'Ort'],
                ].map(([field, label]) => (
                  <div key={field} style={{ minWidth: 220 }}>
                    <div className="sub">{label}</div>
                    <select value={map[field] ?? -1} onChange={(e) => setMapField(field, Number(e.target.value))} style={{ width: '100%', padding: '10px 12px' }}>
                      <option value={-1}>— nicht verwenden —</option>
                      {headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {typeKey === 'backlog' ? (
            <div>
              <h2 className="h2">Backlog Einstellungen</h2>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                <div style={{ minWidth: 260 }}>
                  <div className="sub">Kundennummer-Spalte *</div>
                  <select value={customerCol} onChange={(e) => setCustomerCol(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px' }}>
                    <option value={-1}>— wählen —</option>
                    {headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="sub" style={{ marginTop: 12 }}>Anzuzeigende Spalten (für /backlog):</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {headers.map((h) => (
                  <label key={h} className="secondary" style={{ padding: '8px 10px', borderRadius: 999, border: '1px solid rgba(17,24,39,.12)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={displayCols.includes(h)} onChange={() => toggleDisplayCol(h)} />
                    {h}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {typeKey === 'inventory' ? (
            <div>
              <h2 className="h2">Lagerbestand Einstellungen</h2>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                <div style={{ minWidth: 260 }}>
                  <div className="sub">SKU-Spalte *</div>
                  <select value={skuCol} onChange={(e) => setSkuCol(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px' }}>
                    <option value={-1}>— wählen —</option>
                    {headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 260 }}>
                  <div className="sub">Menge/Qty-Spalte *</div>
                  <select value={qtyCol} onChange={(e) => setQtyCol(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px' }}>
                    <option value={-1}>— wählen —</option>
                    {headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="sub" style={{ marginTop: 12 }}>Anzuzeigende Spalten (für /inventory):</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {headers.map((h) => (
                  <label key={h} className="secondary" style={{ padding: '8px 10px', borderRadius: 999, border: '1px solid rgba(17,24,39,.12)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={displayCols.includes(h)} onChange={() => toggleDisplayCol(h)} />
                    {h}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {typeKey === 'users_ad' ? (
            <div>
              <h2 className="h2">Mapping (Aussendienst Benutzer)</h2>
              <div className="sub">Pflicht: <b>ad_key</b>, <b>first_name</b>, <b>last_name</b>, <b>country_code</b></div>
              <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
                {[
                  ['ad_key', 'AD Key *'],
                  ['first_name', 'Vorname *'],
                  ['last_name', 'Nachname *'],
                  ['country_code', 'Land (DE/AT/CH) *'],
                ].map(([field, label]) => (
                  <div key={field} style={{ minWidth: 240 }}>
                    <div className="sub">{label}</div>
                    <select value={map[field] ?? -1} onChange={(e) => setMapField(field, Number(e.target.value))} style={{ width: '100%', padding: '10px 12px' }}>
                      <option value={-1}>— nicht verwenden —</option>
                      {headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 320 }}>
                  <div className="sub">Email-Erzeugung</div>
                  <label className="sub" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 12 }}>
                    <input type="radio" name="emailMode" checked={emailMode === 'initial_lastname'} onChange={() => setEmailMode('initial_lastname')} />
                    initial_lastname (z.B. e.fuhrmann)
                  </label>
                  <label className="sub" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input type="radio" name="emailMode" checked={emailMode === 'ad_key'} onChange={() => setEmailMode('ad_key')} />
                    ad_key
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid rgba(17,24,39,.08)' }} />

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="sub">Preview (erste 12 Zeilen nach Mapping)</div>
            <button className="secondary" disabled={busy || !me?.isAdmin} onClick={doImport} style={{ padding: '10px 12px' }}>
              {busy ? 'Import läuft…' : 'Import starten'}
            </button>
          </div>

          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(preview?.[0] || {}).map((k) => <th key={k}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={idx}>
                    {Object.keys(preview?.[0] || {}).map((k) => <td key={k}>{String(r?.[k] ?? '')}</td>)}
                  </tr>
                ))}
                {!preview.length ? (
                  <tr>
                    <td className="sub" style={{ padding: 12 }}>Keine Vorschau</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
