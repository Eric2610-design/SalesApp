// Smarter type detection & formatting helpers for CSV/XLSX imports and dataset rendering.

function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '';
}

function looksLikeBool(s) {
  const v = String(s).trim().toLowerCase();
  return ['1', '0', 'true', 'false', 'yes', 'no', 'ja', 'nein', 'j', 'n', 'x'].includes(v);
}

function parseNumberSmart(input) {
  if (input == null) return { ok: false };
  if (typeof input === 'number' && Number.isFinite(input)) return { ok: true, value: input };

  let s = String(input).trim();
  if (!s) return { ok: false };

  // Strip currency symbols and spaces
  s = s
    .replace(/\s+/g, '')
    .replace(/[€$£]|CHF|EUR|USD|GBP/gi, '')
    .trim();

  if (!s) return { ok: false };

  // Percent
  let isPercent = false;
  if (s.endsWith('%')) {
    isPercent = true;
    s = s.slice(0, -1);
  }

  // German/CH format: 1.234,56 or 1'234.56
  // Remove thousands separators: . or ' if there is a decimal comma.
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  const hasApos = s.includes("'");

  if (hasApos) s = s.replace(/'/g, '');

  if (hasComma && hasDot) {
    // Assume dot is thousands, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // Assume comma is decimal
    s = s.replace(',', '.');
  } else {
    // Only dots: could be decimal or thousands. If more than one dot -> thousands.
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, '');
  }

  // Allow leading minus
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: isPercent ? n / 100 : n, isPercent };
}

function parseTime(s) {
  const m = String(s).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  return { hh, mm, ss };
}

function parseDateSmart(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { kind: 'date', date: input };
  }

  const s = String(input ?? '').trim();
  if (!s) return null;

  // ISO date or datetime
  // yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    if (!Number.isNaN(dt.getTime())) {
      return { kind: m[4] ? 'datetime' : 'date', date: dt };
    }
  }

  // EU date: dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy (+ optional time)
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
    const hh = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    if (!Number.isNaN(dt.getTime())) {
      return { kind: m[4] ? 'datetime' : 'date', date: dt };
    }
  }

  // Native parse as last resort (handles RFC/ISO strings)
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return { kind: 'date', date: d };
  }

  return null;
}

function inferTypeFromSamples(samples, colName = '') {
  const name = String(colName || '').toLowerCase();
  const s = (samples || []).filter((x) => !isEmpty(x));
  if (!s.length) return 'leer';

  // If column name strongly hints a type, bias the inference.
  const nameHints = {
    date: /(datum|date|created|updated|liefer|termin)/i,
    time: /(zeit|time)/i,
    number: /(menge|qty|anzahl|bestand|stock|preis|price|summe|total|betrag|value|wert)/i,
    text: /(plz|zip|postcode|telefon|phone|tel|mobil|email|website|url|id|sku|artikel|article|nr|nummer)/i
  };

  // Boolean
  const boolOk = s.every((v) => looksLikeBool(v));
  if (boolOk) return 'boolean';

  // Time
  const timeOk = s.every((v) => parseTime(v));
  if (timeOk) return 'time';

  // Date/Datetime
  const dateParsed = s.map((v) => parseDateSmart(v)).filter(Boolean);
  if (dateParsed.length === s.length) {
    const hasTime = dateParsed.some((x) => x.kind === 'datetime');
    return hasTime ? 'datetime' : 'date';
  }

  // Numeric (but protect ZIP codes and phone-like strings)
  const allNumeric = s.every((v) => parseNumberSmart(v).ok);
  if (allNumeric) {
    const nums = s.map((v) => parseNumberSmart(v).value).filter((n) => Number.isFinite(n));
    const looksExcelDate = nums.length && nums.every((n) => n > 20000 && n < 70000);
    if (looksExcelDate && nameHints.date.test(name)) return 'date_excel';
    if (looksExcelDate && !nameHints.text.test(name)) return 'date_excel';

    // ZIP / phone should stay as text to preserve leading zeros
    const allDigits = s.every((v) => /^\d+$/.test(String(v).trim()));
    if (allDigits) {
      const maxLen = Math.max(...s.map((v) => String(v).trim().length));
      const minLen = Math.min(...s.map((v) => String(v).trim().length));
      if (nameHints.text.test(name)) return 'text';
      if (minLen !== maxLen) return 'text';
      if (maxLen >= 8) return 'text';
    }

    return 'number';
  }

  // If name suggests date, attempt date parsing even if some values are numeric/strings.
  if (nameHints.date.test(name)) {
    const ok = s.every((v) => {
      const d = parseDateSmart(v);
      if (d) return true;
      const n = parseNumberSmart(v);
      return n.ok && n.value > 20000 && n.value < 70000;
    });
    if (ok) return 'date';
  }

  // If name suggests time, keep as text unless strict time
  if (nameHints.time.test(name)) {
    const ok = s.every((v) => parseTime(v));
    if (ok) return 'time';
  }

  return 'text';
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  // Excel epoch (1899-12-30)
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCell(val, type) {
  if (val == null) return '';
  const t = String(type || 'text');

  if (t === 'leer') return '';

  if (t === 'number') {
    const n = parseNumberSmart(val);
    if (n.ok) return String(n.value);
    return String(val);
  }

  if (t === 'boolean') {
    if (typeof val === 'boolean') return val ? 'ja' : 'nein';
    const s = String(val).trim().toLowerCase();
    const yes = ['1', 'true', 'yes', 'ja', 'j', 'x'].includes(s);
    const no = ['0', 'false', 'no', 'nein', 'n', ''].includes(s);
    if (yes) return 'ja';
    if (no) return 'nein';
    return String(val);
  }

  if (t === 'time') {
    const tm = parseTime(val);
    if (!tm) return String(val);
    const hh = String(tm.hh).padStart(2, '0');
    const mm = String(tm.mm).padStart(2, '0');
    const ss = String(tm.ss).padStart(2, '0');
    return tm.ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }

  if (t === 'date_excel') {
    const d = excelSerialToDate(val);
    if (!d) return String(val);
    return d.toLocaleDateString('de-DE');
  }

  if (t === 'date' || t === 'datetime') {
    const parsed = parseDateSmart(val);
    if (parsed?.date) {
      return t === 'datetime'
        ? parsed.date.toLocaleString('de-DE')
        : parsed.date.toLocaleDateString('de-DE');
    }
    const n = parseNumberSmart(val);
    if (n.ok && n.value > 20000 && n.value < 70000) {
      const dd = excelSerialToDate(n.value);
      if (dd) return t === 'datetime' ? dd.toLocaleString('de-DE') : dd.toLocaleDateString('de-DE');
    }
    return String(val);
  }

  return String(val);
}

export { inferTypeFromSamples, formatCell, parseNumberSmart, parseDateSmart };
