'use client';

import { useEffect, useMemo, useState } from 'react';

const COUNTRIES = [
  { code: 'ALL', label: 'Alle' },
  { code: 'DE', label: 'DE' },
  { code: 'AT', label: 'AT' },
  { code: 'CH', label: 'CH' },
];

function fmt(n) {
  return new Intl.NumberFormat('de-CH').format(n);
}

export default function DatabasePage() {
  const [country, setCountry] = useState('ALL');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('country_code');
  const [dir, setDir] = useState('asc');
  const [limit, setLimit] = useState(200);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const totalPages = useMemo(() => {
    if (count == null) return null;
    return Math.max(1, Math.ceil(count / limit));
  }, [count, limit]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const url = new URL('/api/dealers/list', window.location.origin);
      if (country !== 'ALL') url.searchParams.set('country', country);
      if (q.trim()) url.searchParams.set('q', q.trim());
      url.searchParams.set('sort', sort);
      url.searchParams.set('dir', dir);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Daten nicht laden');

      setRows(data.rows || []);
      setCount(typeof data.count === 'number' ? data.count : null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // Initial load
  useEffect(() => {
    load();
    // eslint-disable-nex
