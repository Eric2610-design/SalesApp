import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { pickZipFromRow } from '@/lib/territory';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

function normKey(v) {
  if (v == null) return '';
  let s = (typeof v === 'number') ? String(v) : String(v);
  s = s.trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toLowerCase();
}

function pickName(row) {
  const obj = row?.row_data || {};
  return (
    obj?.Haendler ||
    obj?.Händler ||
    obj?.Name ||
    obj?.name ||
    obj?.Firma ||
    obj?.Company ||
    obj?.company ||
    obj?.Partner ||
    obj?.partner ||
    null
  );
}

function parseBrandKeys(rowData, cfg) {
  const out = [];
  const fields = Array.isArray(cfg?.manufacturerFields) ? cfg.manufacturerFields : [];
  for (const f of fields) {
    const v = rowData?.[f];
    if (v == null) continue;
    const parts = String(v)
      .split(/[,;\n]+/g)
      .map((x) => normKey(x))
      .filter(Boolean);
    for (const p of parts) out.push(p);
  }
  return Array.from(new Set(out));
}

function parseBuyingGroupKey(rowData, cfg) {
  const f = cfg?.buyingGroupField;
  if (!f) return null;
  const v = rowData?.[f];
  const k = normKey(v);
  return k || null;
}

async function latestImportId(admin, dataset) {
  const { data, error } = await admin
    .from('dataset_imports')
    .select('id,created_at')
    .eq('dataset', dataset)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();

  // brands
  const [{ data: manufacturers }, { data: buyingGroups }] = await Promise.all([
    admin.from('manufacturers').select('key,name,icon_data_url').order('name', { ascending: true }),
    admin.from('buying_groups').select('key,name,icon_data_url').order('name', { ascending: true })
  ]);

  // dealer view config (dealer key field)
  const { data: cfgRows } = await admin
    .from('page_configs')
    .select('key,value')
    .eq('key', 'dealer_view')
    .limit(1);
  const dealerCfg = cfgRows?.[0]?.value || {};
  const dealerKeyField = String(dealerCfg?.dealerKey || '').trim() || 'Kundennummer';

  // dealers schema for brand parsing
  const { data: schemas } = await admin.from('dataset_schemas').select('dataset,view_config').eq('dataset', 'dealers').limit(1);
  const brandsCfg = schemas?.[0]?.view_config?.brands || {};

  const dealersImportId = await latestImportId(admin, 'dealers').catch(() => null);
  if (!dealersImportId) {
    return NextResponse.json({
      manufacturers: manufacturers || [],
      buying_groups: buyingGroups || [],
      dealers: [],
      info: 'Kein Dealer-Import gefunden.'
    });
  }

  // overrides
  const overrides = new Map();
  {
    const { data: ovr, error: ovrErr } = await admin
      .from('dealer_brand_overrides')
      .select('dealer_key,manufacturer_keys,buying_group_key,updated_at')
      .limit(20000);
    if (ovrErr) {
      const msg = String(ovrErr.message || '').toLowerCase();
      if (msg.includes('dealer_brand_overrides') && (msg.includes('does not exist') || msg.includes('relation'))) {
        return NextResponse.json({
          error: 'Tabelle dealer_brand_overrides fehlt. Bitte im Admin → Installer das Script "05 dealer brand overrides" ausführen.'
        }, { status: 400 });
      }
      return NextResponse.json({ error: ovrErr.message }, { status: 500 });
    }
    for (const r of ovr || []) {
      const k = normKey(r?.dealer_key);
      if (k) overrides.set(k, r);
    }
  }

  // sample dealer rows
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Math.min(2000, Math.max(50, Number(url.searchParams.get('limit') || 300)));

  const { data: dealerRows, error: rowsErr } = await admin
    .from('dataset_rows')
    .select('row_index,row_data')
    .eq('dataset', 'dealers')
    .eq('import_id', dealersImportId)
    .order('row_index', { ascending: true })
    .limit(20000);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  let dealers = (dealerRows || []).map((r) => {
    const obj = r?.row_data || {};
    const dealerKey = normKey(obj?.[dealerKeyField] ?? r?.row_index);
    const o = dealerKey ? overrides.get(dealerKey) : null;
    const parsedM = parseBrandKeys(obj, brandsCfg);
    const parsedBG = parseBuyingGroupKey(obj, brandsCfg);
    const oM = Array.isArray(o?.manufacturer_keys) ? o.manufacturer_keys : [];
    const mergedM = Array.from(new Set([...oM, ...parsedM].map((x) => normKey(x)).filter(Boolean)));
    const bg = o?.buying_group_key ? normKey(o.buying_group_key) : parsedBG;
    return {
      id: r.row_index,
      dealer_key: dealerKey,
      name: pickName(r),
      city: obj?.Ort ?? obj?.City ?? obj?.city ?? null,
      zip: obj?.PLZ ?? obj?.Zip ?? obj?.zip ?? pickZipFromRow(obj) || null,
      manufacturer_keys: mergedM,
      buying_group_key: bg || null,
      updated_at: o?.updated_at || null
    };
  });

  if (q) {
    dealers = dealers.filter((d) => {
      return (
        String(d?.dealer_key || '').includes(q) ||
        String(d?.name || '').toLowerCase().includes(q) ||
        String(d?.city || '').toLowerCase().includes(q) ||
        String(d?.zip || '').includes(q)
      );
    });
  }

  dealers = dealers.slice(0, limit);

  return NextResponse.json({
    manufacturers: manufacturers || [],
    buying_groups: buyingGroups || [],
    dealers,
    dealerKeyField,
    dealersImportId
  });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  const admin = getSupabaseAdmin();

  // Bulk assign manufacturer to ALL dealers in current import
  if (action === 'bulk_assign_manufacturer') {
    const manufacturer_key = normKey(body.manufacturer_key);
    if (!manufacturer_key) return NextResponse.json({ error: 'Missing manufacturer_key' }, { status: 400 });

    const { data: cfgRows } = await admin
      .from('page_configs')
      .select('key,value')
      .eq('key', 'dealer_view')
      .limit(1);
    const dealerCfg = cfgRows?.[0]?.value || {};
    const dealerKeyField = String(dealerCfg?.dealerKey || '').trim() || 'Kundennummer';

    const dealersImportId = await latestImportId(admin, 'dealers').catch(() => null);
    if (!dealersImportId) return NextResponse.json({ error: 'Kein Dealer-Import gefunden.' }, { status: 400 });

    const { data: dealerRows, error: rowsErr } = await admin
      .from('dataset_rows')
      .select('row_index,row_data')
      .eq('dataset', 'dealers')
      .eq('import_id', dealersImportId)
      .limit(40000);
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

    // existing overrides (for union)
    const existing = new Map();
    {
      const { data: ovr, error: ovrErr } = await admin
        .from('dealer_brand_overrides')
        .select('dealer_key,manufacturer_keys,buying_group_key')
        .limit(20000);
      if (ovrErr) {
        const msg = String(ovrErr.message || '').toLowerCase();
        if (msg.includes('dealer_brand_overrides') && (msg.includes('does not exist') || msg.includes('relation'))) {
          return NextResponse.json({
            error: 'Tabelle dealer_brand_overrides fehlt. Bitte im Admin → Installer das Script "05 dealer brand overrides" ausführen.'
          }, { status: 400 });
        }
        return NextResponse.json({ error: ovrErr.message }, { status: 500 });
      }
      for (const r of ovr || []) {
        const k = normKey(r?.dealer_key);
        if (k) existing.set(k, r);
      }
    }

    const upserts = [];
    for (const r of dealerRows || []) {
      const obj = r?.row_data || {};
      const dealer_key = normKey(obj?.[dealerKeyField] ?? r?.row_index);
      if (!dealer_key) continue;
      const cur = existing.get(dealer_key);
      const curM = Array.isArray(cur?.manufacturer_keys) ? cur.manufacturer_keys : [];
      const merged = Array.from(new Set([...curM, manufacturer_key].map((x) => normKey(x)).filter(Boolean)));
      upserts.push({
        dealer_key,
        manufacturer_keys: merged,
        buying_group_key: cur?.buying_group_key ?? null,
        updated_by: me.profile?.email || me.user?.email || null
      });
    }

    // chunked upsert
    for (let i = 0; i < upserts.length; i += 1000) {
      const chunk = upserts.slice(i, i + 1000);
      const { error } = await admin.from('dealer_brand_overrides').upsert(chunk, { onConflict: 'dealer_key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAdminLog(admin, me, {
      action: 'dealer_brands_bulk_assign_manufacturer',
      target: manufacturer_key,
      payload: { manufacturer_key, count: upserts.length },
      undo: null
    });

    return NextResponse.json({ ok: true, count: upserts.length });
  }

  // Upsert a single dealer override
  const dealer_key = normKey(body.dealer_key);
  if (!dealer_key) return NextResponse.json({ error: 'Missing dealer_key' }, { status: 400 });
  const manufacturer_keys = Array.isArray(body.manufacturer_keys)
    ? body.manufacturer_keys.map((x) => normKey(x)).filter(Boolean)
    : [];
  const buying_group_key = body.buying_group_key != null ? (normKey(body.buying_group_key) || null) : null;

  const row = {
    dealer_key,
    manufacturer_keys,
    buying_group_key,
    updated_by: me.profile?.email || me.user?.email || null
  };

  const { data, error } = await admin
    .from('dealer_brand_overrides')
    .upsert(row, { onConflict: 'dealer_key' })
    .select('dealer_key,manufacturer_keys,buying_group_key,updated_at')
    .limit(1);

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('dealer_brand_overrides') && (msg.includes('does not exist') || msg.includes('relation'))) {
      return NextResponse.json({
        error: 'Tabelle dealer_brand_overrides fehlt. Bitte im Admin → Installer das Script "05 dealer brand overrides" ausführen.'
      }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAdminLog(admin, me, {
    action: 'dealer_brands_upsert',
    target: dealer_key,
    payload: row,
    undo: null
  });

  return NextResponse.json({ ok: true, row: data?.[0] || null });
}
