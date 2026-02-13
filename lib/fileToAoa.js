import * as XLSX from 'xlsx';

function guessDelimiter(text) {
  if (text.includes(';') && !text.includes(',')) return ';';
  return ',';
}

export function toAoaFromFile(file) {
  return new Promise((resolve, reject) => {
    const name = (file?.name || '').toLowerCase();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.onload = () => {
      try {
        if (name.endsWith('.csv') || name.endsWith('.txt')) {
          const text = String(reader.result || '');
          const delim = guessDelimiter(text);
          const rows = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => l.split(delim).map((c) => c.trim()));
          resolve(rows);
          return;
        }

        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        resolve(aoa);
      } catch (e) {
        reject(e);
      }
    };

    if (name.endsWith('.csv') || name.endsWith('.txt')) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}
