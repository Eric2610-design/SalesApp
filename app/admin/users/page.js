'use client';

import { useEffect, useMemo, useState } from 'react';

function genLocalPassword() {
  // fallback if admin wants to prefill; server will generate if empty
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export default function AdminUsersPage() {
  const [err, setErr] = useState('');
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [busyId, setBusyId] = useState('');

  // create form
  const [cEmail, setCEmail] = useState('');
  const [cName, setCName] = useState('');
  const [cPass, setCPass] = useState('');
  const [cGroup, setCGroup] = useState('');
  const [cCountry, setCCountry] = useState('');
  const [cAdKey, setCAdKey] = useState('');
  const [cPlzFilter, setCPlzFilter] = useState('');
  const [createdInfo, setCreatedInfo] = useState(null); // {email,password}

  async function load() {
    setErr('');
    const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const meJ = await meRes.json().catch(() => ({}));
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');
    setMe(meJ);

    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(j?.error || 'Fehler');
    setUsers(j.users || []);
    setGroups(j.groups || []);
  }

  useEffect(() => { load(); }, []);

  const groupNameById = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  async function patch(user_id, patchObj) {
    setBusyId(user_id);
    setErr('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id, ...patchObj })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Update fehlgeschlagen');
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function createUser() {
    const email = cEmail.trim();
    if (!email) return setErr('Bitte Email eingeben.');
    setBusyId('create');
    setErr('');
    setCreatedInfo(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          display_name: cName.trim() || null,
          password: cPass.trim() || null,
          group_id: cGroup || null,
          country_code: cCountry.trim() || null,
          ad_key: cAdKey.trim() || null,
          plz_filter: cPlzFilter.trim() || null
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Erstellen fehlgeschlagen');

      setCreatedInfo({ email: j?.user?.email || email, password: j?.password || null });

      setCEmail('');
      setCName('');
      setCPass('');
      setCGroup('');
      setCCountry('');
      setCAdKey('');
      setCPlzFilter('');

      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function deleteUser(u) {
    const myId = me?.profile?.user_id || me?.user?.id || '';
    if (u.user_id === myId) return setErr('Du kannst dich nicht selbst löschen.');

    const ok = window.confirm(`Benutzer wirklich löschen?\n\n${u.email}`);
    if (!ok) return;

    setBusyId(u.user_id);
    setErr('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: u.user_id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Löschen fehlgeschlagen');
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function viewAs(u) {
    setBusyId(u.user_id);
    setErr('');
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: u.user_id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Fehler');
      window.location.href = '/';
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
    } catch {
      // ignore
    }
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Benutzer</div>
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
        <div className="h1">Admin · Benutzer</div>
        <div className="sub">
          Benutzer werden in Supabase Auth angelegt. Profile liegen in <code>app_users</code> (Gruppe steuert Sichtbarkeit).
        </div>
      </div>

      {/* Create */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900 }}>Benutzer erstellen</div>
            <div className="muted" style={{ fontSize: 12 }}>Wenn kein Passwort gesetzt wird, wird automatisch eins erzeugt.</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="secondary"
              type="button"
              onClick={() => setCPass(genLocalPassword().slice(0, 14))}
              disabled={busyId === 'create'}
            >
              Passwort generieren
            </button>
            <button
              className="primary"
              type="button"
              onClick={createUser}
              disabled={busyId === 'create'}
            >
              {busyId === 'create' ? 'Erstelle…' : 'Erstellen'}
            </button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240, flex: 1 }}>
            <div className="label">Email *</div>
            <input className="input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@firma.de" />
          </div>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div className="label">Name</div>
            <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Anzeige-Name" />
          </div>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div className="label">Passwort</div>
            <input className="input" value={cPass} onChange={(e) => setCPass(e.target.value)} placeholder="(leer = automatisch)" />
          </div>
          <div style={{ minWidth: 200 }}>
            <div className="label">Gruppe</div>
            <select className="input" value={cGroup} onChange={(e) => setCGroup(e.target.value)}>
              <option value="">(Standard)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <div className="label">Land</div>
            <input className="input" value={cCountry} onChange={(e) => setCCountry(e.target.value)} placeholder="DE" />
          </div>
          <div style={{ width: 160 }}>
            <div className="label">AD Key</div>
            <input className="input" value={cAdKey} onChange={(e) => setCAdKey(e.target.value)} placeholder="(optional)" />
          </div>

          <div style={{ minWidth: 260, flexBasis: '100%' }}>
            <div className="label">PLZ-Filter (optional)</div>
            <textarea
              className="input"
              value={cPlzFilter}
              onChange={(e) => setCPlzFilter(e.target.value)}
              placeholder="Beispiele: 6\n60,61,62\n20000-29999"
              rows={2}
              style={{ resize: 'vertical' }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Sichtbarkeit für Außendienst: Prefixe (z.B. 6 / 60 / 60311) oder Bereiche (z.B. 20000-29999).
            </div>
          </div>
        </div>

        {createdInfo ? (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ fontWeight: 900 }}>Benutzer erstellt</div>
            <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
              <div className="muted">{createdInfo.email}</div>
              {createdInfo.password ? (
                <>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="muted">Temporäres Passwort:</span>
                    <code style={{ fontWeight: 800 }}>{createdInfo.password}</code>
                    <button className="secondary" type="button" onClick={() => copy(createdInfo.password)}>Kopieren</button>
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>Passwort wurde von dir gesetzt (wird nicht angezeigt).</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* List */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Gruppe</th>
              <th>Land</th>
              <th>AD Key</th>
              <th style={{ minWidth: 220 }}>PLZ-Filter</th>
              <th className="muted">Auth</th>
              <th style={{ width: 220 }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td style={{ fontWeight: 700 }}>{u.email}</td>
                <td style={{ minWidth: 180 }}>
                  <input
                    className="input"
                    value={u.display_name || ''}
                    disabled={busyId === u.user_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsers((prev) => prev.map(x => x.user_id === u.user_id ? { ...x, display_name: v } : x));
                    }}
                    onBlur={(e) => patch(u.user_id, { display_name: e.target.value })}
                  />
                </td>
                <td style={{ minWidth: 160 }}>
                  <select
                    className="input"
                    value={u.group_id || ''}
                    disabled={busyId === u.user_id}
                    onChange={(e) => patch(u.user_id, { group_id: e.target.value || null })}
                  >
                    <option value="">(keine)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {u.group_id ? groupNameById.get(u.group_id) : ''}
                  </div>
                </td>
                <td style={{ width: 120 }}>
                  <input
                    className="input"
                    value={u.country_code || ''}
                    disabled={busyId === u.user_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsers((prev) => prev.map(x => x.user_id === u.user_id ? { ...x, country_code: v } : x));
                    }}
                    onBlur={(e) => patch(u.user_id, { country_code: e.target.value })}
                    placeholder="DE"
                  />
                </td>
                <td style={{ width: 160 }}>
                  <input
                    className="input"
                    value={u.ad_key || ''}
                    disabled={busyId === u.user_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsers((prev) => prev.map(x => x.user_id === u.user_id ? { ...x, ad_key: v } : x));
                    }}
                    onBlur={(e) => patch(u.user_id, { ad_key: e.target.value })}
                    placeholder="(optional)"
                  />
                </td>
                <td style={{ minWidth: 220 }}>
                  <textarea
                    className="input"
                    value={u.plz_filter || ''}
                    disabled={busyId === u.user_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsers((prev) => prev.map(x => x.user_id === u.user_id ? { ...x, plz_filter: v } : x));
                    }}
                    onBlur={(e) => patch(u.user_id, { plz_filter: e.target.value })}
                    rows={2}
                    style={{ resize: 'vertical' }}
                    placeholder="z.B. 6, 60-69"
                  />
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{u.auth_user_id ? '✓' : '—'}</td>
                <td>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => viewAs(u)}
                    disabled={busyId === u.user_id}
                    style={{ marginRight: 8 }}
                    title="Ansicht als dieser Benutzer öffnen"
                  >
                    Ansicht
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => deleteUser(u)}
                    disabled={busyId === u.user_id}
                    style={{ color: '#b91c1c', borderColor: 'rgba(185, 28, 28, .35)' }}
                    title="Löschen"
                  >
                    {busyId === u.user_id ? '…' : 'Löschen'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
      </div>
    </div>
  );
}
