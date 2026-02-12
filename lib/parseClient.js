'use client';

import { looksLikeHeaderRow, normalizeRow } from './parseCore';

export async function parseDealerRowsFromFile(file, countryCode) {
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
  // header:1 gives array-of-arrays; defval keeps empty cells
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    if (i === 0 && looksLikeHeaderRow(r)) continue;

    const a = r[0];
    const b = r[1];
    const c = r[2];
    const d = r[3];

    // skip empty
    if (!String(a ?? '').trim() && !String(b ?? '').trim() && !String(c ?? '').trim() && !String(d ?? '').trim()) {
      continue;
    }

    const norm = normalizeRow({ a, b, c, d, countryCode });

    // must have at least customer_number or name
    if (!norm.customer_number && !norm.name) continue;
    out.push(norm);
  }

  return out;
}
