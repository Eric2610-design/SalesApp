import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRollbackImport } from '@/lib/adminLog';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_DATASETS = new Set(['dealers', 'backlog', 'inventory']);

function detectDelimiter(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length);
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);

  // Simple CSV parser with quote support.
  const rows = [];
  for (const line of lines) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delimiter) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    rows.push(out.map((v) => String(v ?? '').trim()));
  }

  const header = rows.shift().map((h, idx) => (h || `col_${idx + 1}`).trim());
  const objects = rows.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = r[i] ?? '';
    }
    return obj;
  });

  return objects;
}

async function fileToRows(file) {
  const name = String(file?.name || '').toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);

  if (name.endsWith('.xlsx')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return Array.isArray(json) ? json : [];
  }

  // default CSV
  const text = buf.toString('utf8');
  return parseCsv(text);
}

function filterColumns(rows, selectedCols) {
  if (!Array.isArray(selectedCols) || !selectedCols.length) return rows;
  const cols = selectedCols.map((c) => String(c));
  return (rows || []).map((r) => {
    const obj = {};
    for (const c of cols) obj[c] = (r || {})[c] ?? '';
    return obj;
  });
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form-data' }, { status: 400 });

  const dataset = String(form.get('dataset') || '').trim();
  if (!ALLOWED_DATASETS.has(dataset)) {
    return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const selected_columns = safeParseJson(form.get('selected_columns'));
  const display_columns = safeParseJson(form.get('display_columns'));
  const schema_guess = safeParseJson(form.get('schema_guess'));

  const admin = getSupabaseAdmin();

  let rows = [];
  try {
    rows = await fileToRows(file);
  } catch (e) {
    return NextResponse.json({ error: `Parse failed: ${e?.message || String(e)}` }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'Keine Zeilen gefunden (prüfe Header/Format).' }, { status: 400 });
  }

  rows = filterColumns(rows, selected_columns);

  // Create import record
  const { data: imp, error: impErr } = await admin
    .from('dataset_imports')
    .insert({
      dataset,
      filename: file?.name || null,
      mimetype: file?.type || null,
      row_count: rows.length,
      inserted_count: 0,
      status: 'processing',
      selected_columns: Array.isArray(selected_columns) ? selected_columns : null,
      display_columns: Array.isArray(display_columns) ? display_columns : null,
      schema_guess: schema_guess && typeof schema_guess === 'object' ? schema_guess : null,
      created_by: me?.profile?.email || me?.user?.email || null
    })
    .select('id')
    .limit(1);

  if (impErr) {
    const hint = (impErr.message || '').includes('dataset_imports')
      ? 'Import-Tabellen fehlen/alt. Bitte in Admin → Datenimport einmal „Setup“ ausführen.'
      : '';
    return NextResponse.json({ error: `${impErr.message}${hint ? ` (${hint})` : ''}` }, { status: 500 });
  }

  const importId = imp?.[0]?.id;
  if (!importId) return NextResponse.json({ error: 'Import create failed' }, { status: 500 });

  // Insert rows in batches
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const payload = chunk.map((r, idx) => ({
      import_id: importId,
      dataset,
      row_index: i + idx,
      row_data: r
    }));

    const { error } = await admin.from('dataset_rows').insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted += chunk.length;
    await admin.from('dataset_imports').update({ inserted_count: inserted }).eq('id', importId);
  }

  await admin.from('dataset_imports').update({ status: 'done' }).eq('id', importId);

  await writeAdminLog(admin, me, {
    action: 'import_dataset',
    target: dataset,
    payload: { import_id: importId, filename: file?.name || null, row_count: rows.length },
    undo: undoRollbackImport(importId)
  });

  return NextResponse.json({ ok: true, import_id: importId, row_count: rows.length });
}
