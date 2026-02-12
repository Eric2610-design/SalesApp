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

    if (!fromRaw && !toRaw) continue; // empty row ok
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

  // overlap check per prefixLen (client side)
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
  // groups
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState('');
  const [groupsBusy, setGroupsBusy] = useState(false);

  // users
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [usersBusy, setUsersBusy] = useState(false);

  // create group
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPerms, setNewGroupPerms] = useState(
    PERM_KEYS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {})
  );

  // create user
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [country, setCountry] = useState('DE');
  const [territories, setTerritories] = useState([{ from: '', to: '' }]);

  // UX
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // search/filter in UI (client-side)
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
    const next = {
      ...(group.permissions || {}),
      [key]: val,
    };
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
        body: JSON.stringify({
          id: group.id,
          name: group.name,
          permissions: group.permissions || {},
        }),
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
