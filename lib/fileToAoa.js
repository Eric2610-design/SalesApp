import * as XLSX from 'xlsx/xlsx.mjs';

function guessDelimiter(text) {
  if (text.includes(';') && !text.includes(',')) return ';';
  return ',';
}

// Normalize output so it's always Array<Array<string>>
function normalizeAoa(aoa) {
  const rows = Array.isArray(aoa) ? aoa : [];
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [String(r ?? '')]));
}

export function toAoaFromFile(file) {
  return new Promise((resolve, reject) => {
    try {
      if (!file) return resolve([]);

      const name = String(file?.name || '').toLowerCase();
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));

      reader.onload = () => {
        try {
          // CSV/TXT
          if (name.endsWith('.csv') || name.endsWith('.txt')) {
            const text = String(reader.result || '');
            const delim = guessDelimiter(text);
            const rows = text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => l.split(delim).map((c) => c.trim()));
            return resolve(normalizeAoa(rows));
          }

          // XLSX/XLS
          const ab = reader.result;
          const data = ab instanceof ArrayBuffer ? new Uint8Array(ab) : new Uint8Array([]);
          if (!data.length) return resolve([]);

          const wb = XLSX.read(data, {
            type: 'array',
            cellText: false,
            cellDates: false,
          });

          const sheetName = wb.SheetNames?.[0];
          if (!sheetName) return resolve([]);

          const ws = wb.Sheets[sheetName];
          if (!ws) return resolve([]);

          const aoa = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            raw: false,
            blankrows: false,
            defval: ''
          });

          resolve(normalizeAoa(aoa));
        } catch (e) {
          reject(e);
        }
      };

      if (name.endsWith('.csv') || name.endsWith('.txt')) reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    } catch (e) {
      reject(e);
    }
  });
}
