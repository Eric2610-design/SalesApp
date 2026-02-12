'use client';

import { useEffect, useMemo, useState } from 'react';

const DOMAIN = '@flyer-bikes.com';
const COUNTRIES = [
  { value: '', label: '—' },
  { value: 'DE', label: 'DE' },
  { value: 'AT', label: 'AT' },
  { value: 'CH', label: 'CH' },
];

function PermissionsEditor({ value, onChange }) {
  const [text, setText] = useState(() => JSON.stringify(value || {}, null, 2));

  useEffect(() => {
    setText(JSON.stringify(value || {}, null, 2));
  }, [value]);

  return (
    <div>
      <label>Permissions (JSON)</label>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const obj = JSON.parse(e.target.value || '{}');
            onChange(obj);
          } catch {
            // ignore parse while typing
          }
        }}
      />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Beispiel: {"{"manage_users": true, "view_database": true}"}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);

  // Create group
  const [newGroupName, setNewGroupName] = useState('');
  const [newPerms, setNewPerms] = useState({});

  // Create user
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [country, setCountry] = useState('');
  const [ranges, setRanges] = useState([{ from: '', to: '' }]);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);
  const isAD = useMemo(() => (selectedGroup?.name || '').toLowerCase() === 'aussendienst', [selectedGroup]);

  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      const [gr, us] = await Promise.all([
        fetch('/api/groups/list').then((r) => r.json()),
        fetch('/api/users/list').then((r) => r.json()),
      ]);

      if (!gr.ok) throw new Error(gr.error || 'Gruppen laden fehlgeschlagen');
      if (!us.ok) throw new Error(us.error || 'User laden fehlgeschlagen');

      setGroups(gr.groups || []);
      setUsers(us.users || []);
      if (!groupId && (gr.groups || []).length) setGroupId(gr.groups[0].id);
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createGroup() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, permissions: newPerms }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Gruppe erstellen fehlgeschlagen');
      setNewGroupName('');
      setNewPerms({});
      await load();
      setMsg({ type: 'success', text: `Gruppe "${json.group?.name}" erstellt.` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        local_part: localPart,
        display_name: displayName,
        group_id: groupId,
        country_code: isAD ? country : null,
        territories: isAD ? ranges : [],
      };

      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'User erstellen fehlgeschlagen');

      setLocalPart('');
      setDisplayName('');
      setCountry('');
      setRanges([{ from: '', to: '' }]);
      await load();

      setMsg({ type: 'success', text: `User eingeladen: ${json.email}` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Benutzer & Gruppen</h1>

      {msg?.text && (
        <p className={msg.type === 'error' ? 'error' : 'success'} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}

      <div className="row">
        <section className="card" style={{ padding: 14 }}>
          <h2>Neue Benutzergruppe</h2>
          <label>Name</label>
          <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="z.B. Admin" />

          <div style={{ marginTop: 10 }}>
            <PermissionsEditor value={newPerms} onChange={setNewPerms} />
          </div>

          <button className="primary" disabled={busy || !newGroupName.trim()} onClick={createGroup} style={{ marginTop: 10 }}>
            Gruppe anlegen
          </button>

          <div className="hr" />

          <h2>Vorhandene Gruppen</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {groups.map((g) => (
              <li key={g.id}>
                <b>{g.name}</b> <span className="muted">({g.id.slice(0, 8)}…)</span>
              </li>
            ))}
            {!groups.length && <li className="muted">Keine Gruppen.</li>}
          </ul>
        </section>

        <section className="card" style={{ padding: 14 }}>
          <h2>Neuen Benutzer anlegen</h2>

          <div className="row">
            <div>
              <label>E-Mail (nur vor dem @)</label>
              <input value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="max.mustermann" />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Wird zu <b>{localPart || '…'}{DOMAIN}</b>
              </div>
            </div>
            <div>
              <label>Anzeigename</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Max Mustermann" />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Gruppe</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Land (nur für Aussendienst)</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={!isAD}>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isAD && (
            <>
              <h2>Vertriebsgebiete (PLZ‑Prefix von–bis)</h2>
              <div className="muted" style={{ marginBottom: 8 }}>
                Beispiel: 60–69 und 50–59. Von/Bis müssen gleich viele Stellen haben (2–5).
              </div>

              {ranges.map((r, idx) => (
                <div key={idx} className="row" style={{ marginBottom: 8 }}>
                  <div>
                    <label>Von</label>
                    <input value={r.from} onChange={(e) => setRanges((xs) => xs.map((x, i) => (i === idx ? { ...x, from: e.target.value } : x)))} placeholder="60" />
                  </div>
                  <div>
                    <label>Bis</label>
                    <input value={r.to} onChange={(e) => setRanges((xs) => xs.map((x, i) => (i === idx ? { ...x, to: e.target.value } : x)))} placeholder="69" />
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  disabled={busy}
                  onClick={() => setRanges((xs) => [...xs, { from: '', to: '' }])}
                >
                  + Bereich hinzufügen
                </button>
                <button
                  className="danger"
                  disabled={busy || ranges.length <= 1}
                  onClick={() => setRanges((xs) => xs.slice(0, -1))}
                >
                  − Letzten entfernen
                </button>
              </div>
            </>
          )}

          <button className="primary" disabled={busy || !localPart.trim() || !groupId} onClick={createUser} style={{ marginTop: 12 }}>
            Benutzer einladen
          </button>
        </section>
      </div>

      <div className="hr" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="primary" disabled={busy} onClick={load}>{busy ? 'Lade…' : 'Aktualisieren'}</button>
        <span className="muted">Users: {users.length}</span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>E-Mail</th>
            <th>Name</th>
            <th>Gruppe</th>
            <th>Land</th>
            <th>Gebiete</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id}>
              <td>{u.email}</td>
              <td>{u.display_name || ''}</td>
              <td>{u.group?.name || ''}</td>
              <td>{u.country_code || ''}</td>
              <td className="muted">
                {(u.territories || []).map((t) => `${t.from_prefix}-${t.to_prefix} (${t.prefix_len})`).join(', ')}
              </td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={5} className="muted">Keine Benutzer.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
