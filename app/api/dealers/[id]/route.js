import { NextResponse } from 'next/server';
import { getUserFromCookie } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function normKey(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

async function getLatestImport(admin, dataset) {
  const { data, error } = await admin
    .from('dataset_imports')
    .select('*')
    .eq('dataset', dataset)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function getSchema(admin, dataset) {
  const { data, error } = await admin
    .from('dataset_schemas')
    .select('dataset,display_columns,import_columns,column_types,column_labels,joins,view_config,updated_by,updated_at')
    .eq('dataset', dataset)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function getPageConfig(admin, key) {
  const { data, error } = await admin
    .from('page_configs')
    .select('key,config,updated_at,updated_by')
    .eq('key', key)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.config || null;
}

function guessKey(obj, preferred = []) {
  const keys = Object.keys(obj || {});
  for (const p of preferred) {
    const hit = keys.find((k) => k.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  const patterns = [/(kunden|kunde)/i, /(dealer|haendler|händler)/i, /(nr|nummer|number|id)/i];
  for (const re of patterns) {
    const hit = keys.find((k) => re.test(k));
    if (hit) return hit;
  }
  return keys[0] || '';
}

export async function GET(req, ctx) {
  const user = await getUserFromCookie(req.cookies);
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });

  const id = ctx?.params?.id;
  const rowIndex = Number(id);
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return NextResponse.json({ error: 'Ungültige Händler-ID' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    const [dealersImp, backlogImp, dealersSchema, backlogSchema, config] = await Promise.all([
      getLatestImport(admin, 'dealers'),
      getLatestImport(admin, 'backlog'),
      getSchema(admin, 'dealers'),
      getSchema(admin, 'backlog'),
      getPageConfig(admin, 'dealer_view')
    ]);

    if (!dealersImp?.id) return NextResponse.json({ error: 'Keine Händler-Daten vorhanden.' }, { status: 404 });

    const { data: dealerRow, error: dealerErr } = await admin
      .from('dataset_rows')
      .select('row_index,row_data')
      .eq('import_id', dealersImp.id)
      .eq('row_index', rowIndex)
      .limit(1);
    if (dealerErr) throw new Error(dealerErr.message);
    const dealer = dealerRow?.[0] || null;
    if (!dealer) return NextResponse.json({ error: 'Händler nicht gefunden.' }, { status: 404 });

    const cfg = (config && typeof config === 'object') ? config : {};
    const dealerKey = cfg.dealer_key || guessKey(dealer.row_data, ['Kundennummer', 'KundenNr', 'Kunde', 'Händlernummer', 'Haendlernummer']);
    const backlogKey = cfg.backlog_key || 'Kundennummer';
    const dealerVal = dealer.row_data?.[dealerKey];

    let backlogRows = [];
    if (cfg.backlog_enabled !== false && backlogImp?.id && dealerVal != null && String(dealerVal).trim() !== '') {
      const { data: rawBacklog, error: bErr } = await admin
        .from('dataset_rows')
        .select('row_index,row_data')
        .eq('import_id', backlogImp.id)
        .limit(2500);
      if (bErr) throw new Error(bErr.message);
      const target = normKey(dealerVal);
      backlogRows = (rawBacklog || []).filter((r) => normKey(r?.row_data?.[backlogKey]) === target).slice(0, 300);
    }

    return NextResponse.json({
      dealer,
      dealer_schema: dealersSchema,
      dealer_import: dealersImp,
      backlog_rows: backlogRows,
      backlog_schema: backlogSchema,
      backlog_import: backlogImp,
      config: {
        dealer_key: dealerKey,
        backlog_key: backlogKey,
        backlog_enabled: cfg.backlog_enabled !== false,
        dealer_columns: Array.isArray(cfg.dealer_columns) ? cfg.dealer_columns : null,
        backlog_columns: Array.isArray(cfg.backlog_columns) ? cfg.backlog_columns : null
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
