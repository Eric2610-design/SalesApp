'use client';

import { useEffect, useMemo, useState } from 'react';
import { toAoaFromFile } from '../../lib/fileToAoa';

const DOMAIN = 'flyer-bikes.com';
const COUNTRIES = ['DE', 'AT', 'CH'];

const PERM_KEYS = [
  { key: 'manage_users', label: 'User verwalten' },
  { key: 'import_dealers', label: 'Händler importieren' },
  { key: 'view_database', label: 'Datenbank ansehen' },
  { key: 'view_all_countries', label: 'Alle Länder sehen' },
  { key: 'edit_territories', label: 'Gebiete bearbeiten' },
];

function toBool(v) {
  return v === true;
}

function isValidLocalPart(s) {
  return /^[a-zA-Z0-9._-]+$/.test(s);
}

function normalizeRangeValue(v) {
  return String(v ?? '').trim();
}

function validateRangesClient(ranges) {
  const parsed = [];
  for (const r of ranges) {
    const fromRaw = normalizeRangeValue(r?.from);
    const toRaw = normalizeRangeValue(r?.to);

    if (!fromRaw && !toRaw) continue;
    if (!fromRaw || !toRaw) throw new Error('Jede Range braucht „von“ und „bis“.');

    if (!/^\d+$/.test(fromRaw) || !/^\d+$/.test(toRaw)) {
      throw new Error(`Ungültige Range "${fromRaw}-${toRaw}" (nur Ziffern).`);
    }
    if (fromRaw.length !== toRaw.length) {
      throw new Error(`Ungültige Range "${fromRaw}-${toRaw}" (von/bis müssen gleich viele Stellen haben).`);
    }

    const prefixLen = fromRaw.length;
    if (prefixLen < 2 || prefixLen > 5) {
      throw new Error(`Ungültige Range "${fromRaw}-${toRaw}" (Prefix-Länge 2–5).`);
    }

    const from = parseInt(fromRaw, 10);
    const to = parseInt(toRaw, 10);
    if (from > to) throw new Error(`Ungültige Range "${fromRaw}-${toRaw}" (von > bis).`);

    parsed.push({ prefixLen, from, to });
  }

  parsed.sort((a, b) => a.prefixLen - b.prefixLen || a.from - b.from);
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (prev.prefixLen === cur.prefixLen && cur.from <= prev.to) {
      throw new Error(`Ranges überlappen sich: ${prev.from}-${prev.to} und ${cur.from}-${cur.to}`);
    }
  }

  return parsed;
}

function formatPrefix(n, len) {
  const s = String(n ?? '');
  return len ? s.padStart(len, '0') : s;
}


export default function UsersPage() {
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState('');
  const [groupsBusy, setGroupsBusy] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [usersBusy, setUsersBusy] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPerms, setNewGroupPerms] = useState(
    PERM_KEYS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {})
  );

  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [country, setCountry] = useState('DE');
  const [territories, setTerritories] = useState([{ from: '', to: '' }]);

  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

// Bulk upload Außendienst (Excel/CSV)
const [bulkFile, setBulkFile] = useState(null);
const [bulkAoa, setBulkAoa] = useState([]);
const [bulkHasHeader, setBulkHasHeader] = useState(true);
const [bulkEmailMode, setBulkEmailMode] = useState('initial_lastname'); // 'initial_lastname' | 'ad_key'
const [bulkMap, setBulkMap] = useState({ ad_key: 0, last_name: 1, first_name: 2, country_code: 3 });
const [bulkStatus, setBulkStatus] = useState('');
const [bulkResult, setBulkResult] = useState(null);


  const [userSearch, setUserSearch] = useState('');
  const [showOnlyAD, setShowOnlyAD] = useState(false);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);
  const isAD = useMemo(() => (selectedGroup?.name || '').toLowerCase() === 'aussendienst', [selectedGroup]);

  const emailPreview = useMemo(() => {
    const l = localPart.trim();
    if (!l) return '';
    return l.includes('@') ? l : `${l}@${DOMAIN}`;
  }, [localPart]);

  const filteredUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (showOnlyAD) {
        const gname = (u.group?.name || '').toLowerCase();
        if (gname !== 'aussendienst') return false;
      }
      if (!s) return true;
      return (
        String(u.email || '').toLowerCase().includes(s) ||
        String(u.display_name || '').toLowerCase().includes(s) ||
        String(u.group?.name || '').toLowerCase().includes(s) ||
        String(u.country_code || '').toLowerCase().includes(s)
      );
    });
  }, [users, userSearch, showOnlyAD]);

  async function loadGroups() {
    setGroupsBusy(true);
    setGroupsError('');
    try {
      const res = await fetch('/api/groups/list');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Gruppen nicht laden');
      setGroups(data.groups || []);
      if (!groupId && (data.groups || []).length) setGroupId(data.groups[0].id);
    } catch (e) {
      setGroupsError(e?.message || String(e));
    } finally {
      setGroupsBusy(false);
    }
  }

  async function loadUsers() {
    setUsersBusy(true);
    setUsersError('');
    try {
      const res = await fetch('/api/users/list');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte User nicht laden');
      setUsers(data.users || []);
    } catch (e) {
      setUsersError(e?.message || String(e));
    } finally {
      setUsersBusy(false);
    }
  }

  useEffect(() => {
    loadGroups();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateExistingGroupPerm(group, key, val) {
    const next = { ...(group.permissions || {}), [key]: val };
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, permissions: next } : g)));
  }

  async function saveGroup(group) {
    setToast('');
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/groups/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: group.id, name: group.name, permissions: group.permissions || {} }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Speichern fehlgeschlagen');
      setToast(`Gruppe gespeichert: ${data.group.name}`);
      await loadGroups();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    setToast('');
    setError('');
    const name = newGroupName.trim();
    if (!name) return setError('Gruppenname fehlt');

    setBusy(true);
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, permissions: newGroupPerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Gruppe anlegen fehlgeschlagen');
      setToast(`Gruppe angelegt: ${data.group.name}`);
      setNewGroupName('');
      setNewGroupPerms(PERM_KEYS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {}));
      await loadGroups();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function addTerritoryRow() {
    setTerritories((t) => [...t, { from: '', to: '' }]);
  }
  function removeTerritoryRow(idx) {
    setTerritories((t) => t.filter((_, i) => i !== idx));
  }
  function setTerritory(idx, key, val) {
    setTerritories((t) => t.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  }

  async function createUser() {
    setToast('');
    setError('');

    const local = localPart.trim();
    if (!local) return setError('Bitte Benutzername (Teil vor @) eingeben.');
    if (local.includes('@')) return setError('Bitte nur den Teil vor dem @ eingeben.');
    if (!isValidLocalPart(local)) return setError('Ungültig: nur a-z, 0-9, . _ -');
    if (!groupId) return setError('Bitte eine Gruppe auswählen.');

    if (isAD) {
      if (!COUNTRIES.includes(country)) return setError('Aussendienst braucht ein Land (DE/AT/CH).');
      try {
        const parsed = validateRangesClient(territories);
        if (!parsed.length) return setError('Aussendienst braucht mindestens ein Gebiet (von–bis).');
      } catch (e) {
        return setError(e?.message || String(e));
      }
    }

    setBusy(true);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          local_part: local,
          display_name: displayName.trim() || null,
          group_id: groupId,
          country_code: isAD ? country : null,
          territories: isAD ? territories : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'User anlegen fehlgeschlagen');

      setToast(`User angelegt & eingeladen: ${data.email}`);
      setLocalPart('');
      setDisplayName('');
      setTerritories([{ from: '', to: '' }]);
      await loadUsers();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">Benutzer & Rollen</h1>
          <p className="sub">Benutzer anlegen (immer @flyer-bikes.com), Gruppen/Rechte verwalten, Außendienst mit Land + PLZ-Prefix-Gebieten.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
            ← Home
          </a>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Admin →
          </a>
          <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
            Datenbank →
          </a>
          <a className="secondary" href="/backlog" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>Auftragsrückstand</a>
          <a className="secondary" href="/inventory" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>Lagerbestand</a>
        </div>
      </div>

      <div className="grid">
        {/* USER CREATE */}
        <div className="card">
          <h2>Benutzer anlegen</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Benutzername (vor dem @)</label>
              <br />
              <input value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="z.B. max.mustermann" disabled={busy} style={{ width: '100%' }} />
              <div className="small" style={{ marginTop: 6 }}>
                E-Mail: <span className="mono">{emailPreview || '—'}</span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Anzeigename (optional)</label>
              <br />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="z.B. Max Mustermann" disabled={busy} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 220 }}>
              <label>Gruppe</label>
              <br />
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy || groupsBusy}>
                {(groups || []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {isAD ? (
              <div style={{ minWidth: 220 }}>
                <label>Land (Aussendienst Pflicht)</label>
                <br />
                <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {isAD ? (
            <>
              <h3 style={{ marginTop: 10 }}>Gebiete (PLZ-Prefix von–bis)</h3>
              <div className="small" style={{ marginBottom: 8 }}>
                Beispiele: <span className="mono">50–59</span> oder <span className="mono">60–69</span>. Ranges dürfen sich nicht überlappen.
              </div>

              {territories.map((r, idx) => (
                <div key={idx} className="row" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 120 }}>
                    <label>von</label>
                    <br />
                    <input value={r.from} onChange={(e) => setTerritory(idx, 'from', e.target.value)} placeholder="z.B. 50" disabled={busy} />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <label>bis</label>
                    <br />
                    <input value={r.to} onChange={(e) => setTerritory(idx, 'to', e.target.value)} placeholder="z.B. 59" disabled={busy} />
                  </div>
                  <button className="secondary" onClick={() => removeTerritoryRow(idx)} disabled={busy || territories.length <= 1}>
                    Entfernen
                  </button>
                </div>
              ))}

              <button className="secondary" onClick={addTerritoryRow} disabled={busy}>+ Range hinzufügen</button>
            </>
          ) : null}

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={createUser} disabled={busy}>Benutzer anlegen & einladen</button>
            <button className="secondary" onClick={loadUsers} disabled={busy || usersBusy}>Benutzer neu laden</button>
          </div>

          {toast ? <div className="toast">{toast}</div> : null}
          {error ? <div className="error">{error}</div> : null}
        </div>

        {/* GROUPS */}
        <div className="card">
          <h2>Benutzergruppen & Rechte</h2>
          {groupsError ? <div className="error">{groupsError}</div> : null}

          <div className="row" style={{ marginBottom: 12, alignItems: 'end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label>Neue Gruppe</label>
              <br />
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="z.B. Innendienst" disabled={busy} style={{ width: '100%' }} />
              <div className="small" style={{ marginTop: 6 }}>
                Beispiel JSON (nur Info): <span className="mono">{'{"manage_users": true, "view_database": true}'}</span>
              </div>
            </div>

            <button onClick={createGroup} disabled={busy}>Gruppe anlegen</button>
            <button className="secondary" onClick={loadGroups} disabled={busy || groupsBusy}>Neu laden</button>
          </div>

          <div className="small" style={{ marginBottom: 8 }}>Rechte für neue Gruppe:</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
            {PERM_KEYS.map((p) => (
              <label key={p.key} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={toBool(newGroupPerms[p.key])} onChange={(e) => setNewGroupPerms((s) => ({ ...s, [p.key]: e.target.checked }))} disabled={busy} />
                {p.label}
              </label>
            ))}
          </div>

          <div className="tableWrap">
            <table style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Gruppe</th>
                  {PERM_KEYS.map((p) => <th key={p.key}>{p.label}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td className="mono">{g.name}</td>
                    {PERM_KEYS.map((p) => (
                      <td key={p.key} style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={toBool(g.permissions?.[p.key])} onChange={(e) => updateExistingGroupPerm(g, p.key, e.target.checked)} disabled={busy} />
                      </td>
                    ))}
                    <td style={{ textAlign: 'right' }}>
                      <button className="secondary" onClick={() => saveGroup(g)} disabled={busy}>Speichern</button>
                    </td>
                  </tr>
                ))}
                {!groups.length ? (
                  <tr><td colSpan={PERM_KEYS.length + 2} className="small" style={{ padding: 12 }}>Keine Gruppen gefunden.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* USERS LIST */}
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 10 }}>
            <div>
              <h2>Benutzer (Übersicht)</h2>
              <div className="small">
                Geladen: <span className="mono">{users.length}</span> {usersBusy ? '· Lädt…' : ''}
              </div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ minWidth: 240 }}>
                <label>Suche</label>
                <br />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="E-Mail, Name, Gruppe…" disabled={busy} />
              </div>

              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={showOnlyAD} onChange={(e) => setShowOnlyAD(e.target.checked)} disabled={busy} />
                nur Außendienst
              </label>

              <button className="secondary" onClick={loadUsers} disabled={busy || usersBusy}>Neu laden</button>
            </div>
          </div>

          {usersError ? <div className="error">{usersError}</div> : null}

          <div className="tableWrap">
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>E-Mail</th>
                  <th>Name</th>
                  <th>Gruppe</th>
                  <th>Land</th>
                  <th>Gebiete</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const gname = (u.group?.name || '').toLowerCase();
                  const isUserAD = gname === 'aussendienst';

                  const terr = (u.territories || [])
                    .slice()
                    .sort((a, b) => a.prefix_len - b.prefix_len || a.from_prefix - b.from_prefix)
                    .map((t) => `${formatPrefix(t.from_prefix, t.prefix_len)}-${formatPrefix(t.to_prefix, t.prefix_len)}`)
                    .join(', ');

                  return (
                    <tr key={u.user_id}>
                      <td className="mono">{u.email}</td>
                      <td>{u.display_name || ''}</td>
                      <td className="mono">{u.group?.name || ''}</td>
                      <td className="mono">{u.country_code || ''}</td>
                      <td className="mono">{terr}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isUserAD ? (
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <a className="secondary" href={`/users/${u.user_id}`} style={{ textDecoration: 'none', padding: '6px 10px', borderRadius: 10, display: 'inline-block' }}>
                            Übersicht →
                          </a>
                          <a className="secondary" href={`/users/${u.user_id}/dealers`} style={{ textDecoration: 'none', padding: '6px 10px', borderRadius: 10, display: 'inline-block' }}>
                            Händler →
                          </a>
                        </div>
                        ) : <span className="small">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {!filteredUsers.length ? (
                  <tr><td colSpan={6} className="small" style={{ padding: 12 }}>Noch keine Benutzer / keine Treffer.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Hinweis: „Händler →“ funktioniert, wenn /users/[id]/dealers + dealer_ad_matches View existieren.
          </div>
        </div>
<div className="card" style={{ gridColumn: '1 / -1' }}>
  <h2 style={{ marginTop: 0 }}>Außendienst per Datei importieren</h2>
  <div className="small" style={{ marginBottom: 10 }}>
    Upload aus Excel/CSV (z.B. Spalten: AD_KEY, Nachname, Vorname, Land). Du kannst Zuordnung & E-Mail-Logik wählen.
  </div>

  <div className="row" style={{ alignItems: 'end' }}>
    <div style={{ flex: 1, minWidth: 260 }}>
      <label>Datei (XLSX/CSV)</label><br />
      <input
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        onChange={async (e) => {
          const f = e.target.files?.[0] || null;
          setBulkFile(f);
          setBulkResult(null);
          setBulkStatus('');
          if (!f) { setBulkAoa([]); return; }
          try {
            setBulkStatus('Lese Datei…');
            const rows = await toAoaFromUpload(f);
            const cleaned = (rows || []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
            setBulkAoa(cleaned);
            setBulkStatus(`Geladen: ${cleaned.length} Zeilen`);
          } catch (err) {
            setBulkAoa([]);
            setBulkStatus(`Fehler: ${err?.message || String(err)}`);
          }
        }}
        disabled={busy}
        style={{ width: '100%' }}
      />
    </div>

    <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="checkbox" checked={bulkHasHeader} onChange={(e) => setBulkHasHeader(e.target.checked)} />
      erste Zeile ist Header
    </label>

    <div>
      <label>E-Mail aus…</label><br />
      <select value={bulkEmailMode} onChange={(e) => setBulkEmailMode(e.target.value)} disabled={busy}>
        <option value="ad_key">AD_KEY (z.B. adfly_001@flyer-bikes.com)</option>
        <option value="initial_lastname">1. Buchstabe.Nachname (z.B. m.mustermann@flyer-bikes.com)</option>
      </select>
    </div>
  </div>

  {bulkStatus ? <div className="small" style={{ marginTop: 10 }}>{bulkStatus}</div> : null}

  {bulkAoa.length ? (
    <>
      <hr className="sep" />
      <h3 style={{ marginTop: 0 }}>Spalten zuordnen</h3>

      {(() => {
        const header = bulkAoa?.[0] || [];
        const cols = header.map((h, i) => ({ i, label: String(h || `Spalte ${i + 1}`) }));
        const colLabel = (idx) => cols.find((c) => c.i === idx)?.label || `Spalte ${idx + 1}`;
        const setField = (field, value) => setBulkMap((m) => ({ ...m, [field]: Number(value) }));

        return (
          <div className="row">
            <div>
              <label>AD_KEY</label><br />
              <select value={bulkMap.ad_key} onChange={(e) => setField('ad_key', e.target.value)} disabled={busy}>
                {cols.map((c) => <option key={c.i} value={c.i}>{colLabel(c.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Nachname</label><br />
              <select value={bulkMap.last_name} onChange={(e) => setField('last_name', e.target.value)} disabled={busy}>
                {cols.map((c) => <option key={c.i} value={c.i}>{colLabel(c.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Vorname</label><br />
              <select value={bulkMap.first_name} onChange={(e) => setField('first_name', e.target.value)} disabled={busy}>
                {cols.map((c) => <option key={c.i} value={c.i}>{colLabel(c.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Land</label><br />
              <select value={bulkMap.country_code} onChange={(e) => setField('country_code', e.target.value)} disabled={busy}>
                {cols.map((c) => <option key={c.i} value={c.i}>{colLabel(c.i)}</option>)}
              </select>
            </div>
          </div>
        );
      })()}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          onClick={async () => {
            setToast('');
            setError('');
            setBulkResult(null);

            if (!bulkAoa.length) { setError('Bitte erst eine Datei wählen'); return; }

            const start = bulkHasHeader ? 1 : 0;
            const rows = [];
            for (let i = start; i < bulkAoa.length; i++) {
              const r = bulkAoa[i] || [];
              const get = (idx) => String(r[idx] ?? '').trim();

              const ad_key = get(bulkMap.ad_key);
              const last_name = get(bulkMap.last_name);
              const first_name = get(bulkMap.first_name);
              const country_code = get(bulkMap.country_code).toUpperCase();

              if (!ad_key && !first_name && !last_name) continue;

              rows.push({ ad_key, first_name, last_name, country_code });
            }

            setBusy(true);
            try {
              const res = await fetch('/api/users/bulk-create-ad', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ rows, email_mode: bulkEmailMode }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error || 'Bulk Import fehlgeschlagen');

              setBulkResult(data);
              setToast(`Bulk-Import fertig: ${data.created} erstellt, ${data.skipped} übersprungen, ${data.failed} Fehler`);
              await loadUsers();
            } catch (e) {
              setError(e?.message || String(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          Bulk-Import starten
        </button>

        <div className="small">
          Voraussetzung: SQL <span className="mono">supabase/ad_key_migration.sql</span> ausführen (AD_KEY Spalte).
        </div>
      </div>

      {bulkResult ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="small">Ergebnis (Auszug):</div>
          <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify({ created: bulkResult.created, skipped: bulkResult.skipped, failed: bulkResult.failed, sample: (bulkResult.results || []).slice(0, 25) }, null, 2)}
          </pre>
        </div>
      ) : null}
    </>
  ) : null}
</div>

      </div>
    </div>
  );
}
