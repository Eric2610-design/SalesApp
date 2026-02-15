function onlyDigits(s) {
  return String(s || '').replace(/\D+/g, '');
}

export function normalizeZip(zip) {
  const d = onlyDigits(zip);
  if (!d) return '';
  // Keep leading zeros if present in the original input.
  // If it's shorter, left-pad to 5 for numeric comparisons.
  if (d.length >= 5) return d.slice(0, 5);
  return d.padStart(5, '0');
}

export function parsePlzFilter(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const parts = t
    .split(/[\n,;]+/g)
    .map((x) => String(x).trim())
    .filter(Boolean);

  const rules = [];
  for (const p of parts) {
    const s = p.replace(/\s+/g, '');
    const m = s.match(/^(\d{1,5})-(\d{1,5})$/);
    if (m) {
      const from = normalizeZip(m[1]);
      const to = normalizeZip(m[2]);
      if (from && to) rules.push({ type: 'range', from, to });
      continue;
    }
    if (/^\d{1,5}$/.test(s)) {
      // prefix or exact (we treat it as prefix, so 60311 matches exactly as well)
      rules.push({ type: 'prefix', value: String(s) });
      continue;
    }
  }
  return rules;
}

export function zipAllowed(zip, rules) {
  const z = normalizeZip(zip);
  if (!rules || !rules.length) return true;
  if (!z) return false;

  for (const r of rules) {
    if (r?.type === 'prefix') {
      const pref = String(r.value || '').trim();
      if (!pref) continue;
      if (z.startsWith(pref)) return true;
    } else if (r?.type === 'range') {
      const from = normalizeZip(r.from);
      const to = normalizeZip(r.to);
      if (!from || !to) continue;
      if (z >= from && z <= to) return true;
    }
  }
  return false;
}

export function pickZipFromRow(rowData) {
  const obj = rowData || {};
  const keys = Object.keys(obj);
  const mapLower = new Map(keys.map((k) => [String(k).toLowerCase(), k]));
  const candidates = [
    'plz',
    'zip',
    'postal_code',
    'postleitzahl',
    'postcode'
  ];
  for (const c of candidates) {
    const k = mapLower.get(c);
    if (!k) continue;
    const v = obj[k];
    const z = normalizeZip(v);
    if (z) return z;
  }
  return '';
}
