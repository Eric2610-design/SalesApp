'use client';

import { looksLikeHeaderRow, normalizeMappedRow } from './parseCore';

function colLetter(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function readWorkbookRows(file) {
  if (!file) throw new Error('Keine Datei gewählt.');

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv');

  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();

  let wb;
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buf);
    wb = XLSX.read(text, { type: 'string' });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }

  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error('Keine Tabelle gefunden.');

  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

export function suggestMapping(columns) {
  const labels = columns.map(c => (c.label || '').toLowerCase());

  const pick = (keys) => {
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (keys.some(k => l.includes(k))) return columns[i].idx;
    }
    return -1;
  };

  const mapping = {
    customer_number: pick(['kundennr', 'kundennummer', 'customer', 'nummer', 'nr']),
    name: pick(['kunde', 'kundenname', 'name', 'firma', 'customer name']),
    street: pick(['straße', 'strasse', 'street', 'adresse', 'address']),
    postal_code: pick(['plz', 'post', 'zip', 'postal']),
    city: pick(['ort', 'stadt', 'city'])
  };

  // Fallback by position A–E
  const fallback = [0, 1, 2, 3, 4];
  const fields = ['customer_number', 'name', 'street', 'postal_code', 'city'];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (mapping[f] === -1 && columns.length > fallback[i]) mapping[f] = fallback[i];
  }

  return mapping;
}

export async function getSheetPreview(file) {
  const rows = await readWorkbookRows(file);
  const first = rows?.[0] ?? [];
  const hasHeader = looksLikeHeaderRow(first);
  const headerRow = hasHeader ? first : [];

  const maxCols = Math.max(0, ...rows.map(r => Array.isArray(r) ? r.length : 0));

  const columns = Array.from({ length: maxCols }).map((_, idx) => {
    const header = String(headerRow?.[idx] ?? '').trim();
    const base = colLetter(idx);
    const label = header ? `${base} – ${header}` : base;
    return { idx, label };
  });

  const dataStart = hasHeader ? 1 : 0;
  const sampleRows = rows.slice(dataStart, dataStart + 8).map(r => {
    const arr = Array.isArray(r) ? r : [];
    return Array.from({ length: maxCols }).map((_, i) => String(arr[i] ?? ''));
  });

  const suggestedMapping = suggestMapping(columns);

  return { rows, hasHeader, columns, sampleRows, suggestedMapping };
}

export function parseDealerRowsFromSheet({ rows, hasHeader, mapping, countryCode }) {
  const start = hasHeader ? 1 : 0;
  const out = [];

  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = (idx) => (idx === -1 ? '' : (r?.[idx] ?? ''));

    const customer_number = get(mapping.customer_number);
    const name = get(mapping.name);
    const street = get(mapping.street);
    const postal_code = get(mapping.postal_code);
    const city = get(mapping.city);

    const isEmpty = [customer_number, name, street, postal_code, city]
      .every(v => !String(v ?? '').trim());
    if (isEmpty) continue;

    const norm = normalizeMappedRow({
      customer_number,
      name,
      street,
      postal_code,
      city,
      countryCode
    });

    if (!norm.customer_number && !norm.name) continue;
    out.push(norm);
  }

  return out;
}
