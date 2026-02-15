'use client';

import { useEffect, useMemo, useState } from 'react';

export default function AdminUsersPage() {
  const [err, setErr] = useState('');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [busyId, setBusyId] = useState('');

  async function load() {
    setErr('');
    const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const meJ = await meRes.json().catch(() => ({}));
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

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

  async function patch(user_id, patch) {
    setBusyId(user_id);
    setErr('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id, ...patch })
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
        <div className="sub">Profile aus <code>app_users</code>. Gruppen-Zuordnung steuert die App-Sichtbarkeit.</div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Gruppe</th>
              <th>Land</th>
              <th>AD Key</th>
              <th className="muted">Auth</th>
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
                <td className="muted" style={{ fontSize: 12 }}>{u.auth_user_id ? '✓' : '—'}</td>
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
