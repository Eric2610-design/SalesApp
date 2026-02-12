'use client';

// Robust client-side parsing helpers for XLSX/XLS/CSV uploads.
// Avoid converting large Uint8Array -> string via apply(), which can throw
// "Maximum call stack size exceeded" for big files.

import * as XLSX from 'xlsx';

const MAX_PREVIEW_ROWS = 8;

function colName(i) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA
  let n = i;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function toStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function looksLikeHeaderCell(s) {
  const t = s.toLowerCase();
  return (
    t.includes('kund') ||
    t.includes('customer') ||
    t.includes('debitor') ||
    t.includes('nr') ||
    t.includes('kunde') ||
    t.includes('name') ||
    t.includes('str') ||
    t.includes('street') ||
    t.includes('plz') ||
    t.includes('post') ||
    t.includes('zip') ||
    t.includes('ort') ||
    t.includes('city')
  );
}

function detectHasHeader(rows2d) {
  const r0 = rows2d?.[0] || [];
  const sample = r0.slice(0, 12).map(toStr).filter(Boolean);
  if (!sample.length) return false;

  const hits = sample.reduce((acc, s) => acc + (looksLikeHeaderCell(s) ? 1 : 0), 0);
  if (hits >= 2) return true;

  const nonNumeric = sample.reduce((acc, s) => acc + (/\d/.test(s) ? 0 : 1), 0);
  if (nonNumeric >= Math.max(2, Math.ceil(sample.length * 0.6))) {
    const r1 = rows2d?.[1] || [];
    const r1sample = r1.slice(0, 12).map(toStr).filter(Boolean);
    const r1numeric = r1sample.reduce((acc, s) => acc + (/\d/.test(s) ? 1 : 0), 0);
    if (r1numeric >= 1) return true;
  }

  return false;
}

function suggestMapping(columns) {
  const m = {
    customer_number: 0,
    name: 1,
    street: 2,
    postal_code: 3,
    city: 4,
  };

  const find = (pred) => {
    const c = columns.find(pred);
    return c ? c.idx : -1;
  };

  const cn = find((c) => {
    const t = (c.label || '').toLowerCase();
    return t.includes('kund') || t.includes('customer') || t.includes('debitor');
  });

  const name = find((c) => {
    const t = (c.label || '').toLowerCase();
    return t.includes('kunde') || t.includes('name') || t.includes('firma') || t.includes('shop');
  });

  const street = find((c) => {
    const t = (c.label || '').toLowerCase();
    return t.includes('str') || t.includes('street') || t.includes('adresse');
  });

  const plz = find((c) => {
    const t = (c.label || '').toLowerCase();
    return t.includes('plz') || t.includes('post') || t.includes('zip');
  });

  const city = find((c) => {
    const t = (c.label || '').toLowerCase();
    return t.includes('ort') || t.includes('city') || t.includes('town');
  });

  if (cn !== -1) m.customer_number = cn;
  if (name !== -1) m.name = name;
  if (street !== -1) m.street = street;
  if (plz !== -1) m.postal_code = plz;
  if (city !== -1) m.city = city;

  return m;
}

async function readAsRows2D(file) {
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();

  if (ext === 'csv' || file?.type?.includes('csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    const sep = lines[0]?.includes(';') && !lines[0]?.includes(',') ? ';' : ',';
    return lines.map((line) => line.split(sep).map((c) => toStr(c)));
  }

  // XLSX/XLS: read as ArrayBuffer -> XLSX.read(type:'array') (no stack overflow)
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  return (rows || []).map((r) => (Array.isArray(r) ? r.map(toStr) : []));
}

export async function getSheetPreview(file) {
  const rows = await readAsRows2D(file);
  const hasHeader = detectHasHeader(rows);

  const headerRow = hasHeader ? (rows[0] || []) : [];
  const maxCols = Math.max(
    headerRow.length,
    ...(rows.slice(0, 20).map((r) => (Array.isArray(r) ? r.length : 0)))
  );

  const columns = Array.from({ length: maxCols }, (_, idx) => {
    const label = hasHeader ? toStr(headerRow[idx] || `Spalte ${colName(idx)}`) : `Spalte ${colName(idx)}`;
    return { idx, label };
  });

  const dataStart = hasHeader ? 1 : 0;
  const sampleRows = rows.slice(dataStart, dataStart + MAX_PREVIEW_ROWS);

  return {
    rows,
    hasHeader,
    columns,
    sampleRows,
    suggestedMapping: suggestMapping(columns),
  };
}

function splitStreetHouseNumber(streetRaw) {
  const s = toStr(streetRaw);
  if (!s) return { street: '', house_number: '' };

  const m = s.match(/^(.+?)\s+(\d+[a-zA-Z]?([\/-]\d+[a-zA-Z]?)?)$/);
  if (m) return { street: toStr(m[1]), house_number: toStr(m[2]) };

  return { street: s, house_number: '' };
}

function normalizeCustomerNumber(cnRaw) {
  const s = toStr(cnRaw);
  const left = s.includes('.') ? s.split('.')[0] : s;
  return toStr(left);
}

export function parseDealerRowsFromSheet({ rows, hasHeader, mapping, countryCode }) {
  const out = [];
  const start = hasHeader ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || !r.length) continue;

    const cn = mapping.customer_number === -1 ? '' : normalizeCustomerNumber(r[mapping.customer_number]);
    const name = mapping.name === -1 ? '' : toStr(r[mapping.name]);
    const streetRaw = mapping.street === -1 ? '' : toStr(r[mapping.street]);
    const postal_code = mapping.postal_code === -1 ? '' : toStr(r[mapping.postal_code]);
    const city = mapping.city === -1 ? '' : toStr(r[mapping.city]);

    if (!cn && !name && !streetRaw && !postal_code && !city) continue;

    const { street, house_number } = splitStreetHouseNumber(streetRaw);

    out.push({
      country_code: countryCode,
      customer_number: cn,
      name,
      street,
      house_number,
      postal_code,
      city,
    });
  }

  return out;
}
