'use client';

import { useEffect, useMemo, useState } from 'react';

const DOMAIN = '@flyer-bikes.com';
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

  const [userSearch, setUserSearch] = useState('');
  const [showOnlyAD, setShowOnlyAD] = useState(false);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);
  const isAD = useMemo(() => (selectedGroup?.name || '').toLowerCase() === 'aussendienst', [selectedGroup]);

  const emailPreview = useMemo(() => {
    const l = localPart.trim();
    if (!l) return '';
    return l.includes('@') ? l : `${l}${DOMAIN}`;
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
          <p className="sub">Benutzer anlegen (immer {DOMAIN}), Gruppen/Rechte verwalten, Außendienst mit Land + PLZ-Prefix-Gebieten.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
            ← Import
          </a>
          <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
            Datenbank →
          </a>
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
                          <a className="secondary" href={`/users/${u.user_id}/dealers`} style={{ textDecoration: 'none', padding: '6px 10px', borderRadius: 10, display: 'inline-block' }}>
                            Händler →
                          </a>
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
      </div>
    </div>
  );
}
