import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePlzFilter, pickZipFromRow, zipAllowed } from '@/lib/territory';

function normKey(v) {
  if (v == null) return '';
  // keep stable matching even if Excel/Supabase stores numeric IDs as 123.0
  let s = (typeof v === 'number') ? String(v) : String(v);
  s = s.trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toLowerCase();
}

function parseRawNumber(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim();
  if (!s) return NaN;
  s = s
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeScaledCoord(n, kind) {
  const limit = kind === 'lat' ? 90 : 180;
  if (!Number.isFinite(n)) return NaN;
  if (Math.abs(n) <= limit) return n;

  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const center = kind === 'lat' ? 52 : 10;
  let best = null; // {v, score}

  for (let exp = 0; exp <= 15; exp++) {
    const v = abs / Math.pow(10, exp);
    if (v > limit) continue;
    let score = Math.abs(v - center);
    if (v < 1) score += 100;
    if (kind === 'lat' && (v < 30 || v > 75)) score += 15;
    if (kind === 'lng' && (v < -20 || v > 40)) score += 8;
    if (!best || score < best.score) best = { v, score };
  }

  return best ? best.v * sign : NaN;
}

function parseCoord(v, kind) {
  const n = parseRawNumber(v);
  return normalizeScaledCoord(n, kind);
}

function isLat(n) {
  return Number.isFinite(n) && Math.abs(n) <= 90;
}
function isLng(n) {
  return Number.isFinite(n) && Math.abs(n) <= 180;
}

function resolveKeyCaseInsensitive(obj, wanted) {
  const keys = Object.keys(obj || {});
  const w = String(wanted || '').trim();
  if (!w) return '';
  const hit = keys.find((k) => k.toLowerCase() === w.toLowerCase());
  return hit || '';
}

function pickGeoKeys(obj) {
  const keys = Object.keys(obj || {});
  const lc = (s) => String(s || '').toLowerCase();

  const lat = [];
  const lng = [];
  for (const k of keys) {
    const c = lc(k);
    if (c.includes('latitude') || c === 'lat' || c.endsWith('_lat') || c.includes('breitengrad')) lat.push(k);
    if (c.includes('longitude') || c === 'lng' || c === 'lon' || c.endsWith('_lng') || c.endsWith('_lon') || c.includes('laengengrad') || c.includes('längengrad')) lng.push(k);
  }
  // fallback: common German shortcuts
  for (const k of keys) {
    const c = lc(k);
    if (!lat.length && (c === 'lt' || c === 'breite')) lat.push(k);
    if (!lng.length && (c === 'ln' || c === 'laenge' || c === 'länge')) lng.push(k);
  }
  return { latKeys: lat, lngKeys: lng };
}

function findLatLng(obj, geoCfg) {
  const mode = String(geoCfg?.mode || 'auto');
  const keys = Object.keys(obj || {});
  let latKey = '';
  let lngKey = '';
  let latSource = '';
  let lngSource = '';

  if (mode === 'manual') {
    latKey = resolveKeyCaseInsensitive(obj, geoCfg?.lat_field);
    lngKey = resolveKeyCaseInsensitive(obj, geoCfg?.lng_field);
    if (latKey) latSource = 'manual';
    if (lngKey) lngSource = 'manual';
  }

  const { latKeys, lngKeys } = pickGeoKeys(obj);

  if (!latKey) {
    for (const k of latKeys) {
      const v = parseCoord(obj?.[k], 'lat');
      if (isLat(v)) { latKey = k; latSource = 'auto'; break; }
    }
  }
  if (!lngKey) {
    for (const k of lngKeys) {
      const v = parseCoord(obj?.[k], 'lng');
      if (isLng(v)) { lngKey = k; lngSource = 'auto'; break; }
    }
  }

  // last fallback: try any combination that yields valid coords
  if (!latKey || !lngKey) {
    outer:
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        const la = parseCoord(obj?.[a], 'lat');
        const lo = parseCoord(obj?.[b], 'lng');
        if (isLat(la) && isLng(lo)) {
          if (!latKey) { latKey = a; latSource = latSource || 'auto'; }
          if (!lngKey) { lngKey = b; lngSource = lngSource || 'auto'; }
          break outer;
        }
      }
    }
  }

  if (geoCfg?.swap && latKey && lngKey) {
    const tmp = latKey; latKey = lngKey; lngKey = tmp;
    const ts = latSource; latSource = lngSource; lngSource = ts;
  }

  const lat = latKey ? parseCoord(obj?.[latKey], 'lat') : NaN;
  const lng = lngKey ? parseCoord(obj?.[lngKey], 'lng') : NaN;
  return { lat, lng, latKey, lngKey, latSource, lngSource };
}

function slugKey(v) {
  if (v == null) return '';
  return String(v)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isTruthy(v) {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  return !['0', 'false', 'nein', 'no', 'n', '-'].includes(s);
}

function parseBrandKeys(obj, brandsCfg) {
  const cfg = (brandsCfg && typeof brandsCfg === 'object') ? brandsCfg : {};
  const mode = String(cfg.manufacturer_mode || 'list');
  const field = String(cfg.manufacturer_field || '');
  const sep = String(cfg.manufacturer_separator || '[,;|]');
  const fields = Array.isArray(cfg.manufacturer_fields) ? cfg.manufacturer_fields : [];

  if (mode === 'none') return [];
  if (mode === 'columns') {
    const out = [];
    for (const f of fields) {
      if (isTruthy(obj?.[f])) out.push(slugKey(f));
    }
    return Array.from(new Set(out)).filter(Boolean);
  }

  if (!field) return [];
  const raw = obj?.[field];
  if (Array.isArray(raw)) return raw.map(slugKey).filter(Boolean);
  if (raw == null) return [];
  let re = /[,;|]/;
  try { re = new RegExp(sep); } catch {}
  const parts = String(raw).split(re).map((s) => slugKey(s)).filter(Boolean);
  return Array.from(new Set(parts));
}

function parseBuyingGroupKey(obj, brandsCfg) {
  const cfg = (brandsCfg && typeof brandsCfg === 'object') ? brandsCfg : {};
  const field = String(cfg.buying_group_field || '').trim();
  if (!field) return '';
  const raw = obj?.[field];
  if (raw == null) return '';
  return slugKey(raw);
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
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });

  const effectiveIsAdmin = (typeof me.effectiveIsAdmin === 'boolean') ? me.effectiveIsAdmin : me.isAdmin;
  const effectiveProfile = me.effectiveProfile || me.profile;
  const plzRules = parsePlzFilter(String(effectiveProfile?.plz_filter || ''));
  const restrictByPlz = !effectiveIsAdmin && plzRules.length;

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

    if (restrictByPlz) {
      const z = pickZipFromRow(dealer?.row_data || {});
      if (!zipAllowed(z, plzRules)) {
        return NextResponse.json({ error: 'Kein Zugriff auf diesen Händler.' }, { status: 403 });
      }
    }

    const cfg = (config && typeof config === 'object') ? config : {};
    const dealerKey = cfg.dealer_key || guessKey(dealer.row_data, ['Kundennummer', 'KundenNr', 'Kunde', 'Händlernummer', 'Haendlernummer']);
    // Default: Rückstand-Dateien haben meistens ebenfalls "Kundennummer"
    const backlogKey = cfg.backlog_key || 'Kundennummer';
    const dealerVal = dealer.row_data?.[dealerKey];

    const geoCfg = (dealersSchema?.view_config?.geo && typeof dealersSchema.view_config.geo === 'object')
      ? dealersSchema.view_config.geo
      : {};

    const coords = findLatLng(dealer.row_data || {}, geoCfg);

    const brandsCfg = (dealersSchema?.view_config?.brands && typeof dealersSchema.view_config.brands === 'object')
      ? dealersSchema.view_config.brands
      : {};
    const brands = {
      manufacturer_keys: parseBrandKeys(dealer.row_data || {}, brandsCfg),
      buying_group_key: parseBuyingGroupKey(dealer.row_data || {}, brandsCfg)
    };

    // Apply manual overrides (optional table)
    const dealerKeyNorm = normKey(dealerVal);
    if (dealerKeyNorm) {
      try {
        const { data: ovr, error: ovrErr } = await admin
          .from('dealer_brand_overrides')
          .select('manufacturer_keys,buying_group_key')
          .eq('dealer_key', dealerKeyNorm)
          .limit(1);
        if (!ovrErr && ovr?.[0]) {
          const o = ovr[0];
          const oM = Array.isArray(o?.manufacturer_keys) ? o.manufacturer_keys : [];
          const merged = [...oM, ...(brands.manufacturer_keys || [])]
            .map((x) => String(x || '').trim().toLowerCase())
            .filter(Boolean);
          brands.manufacturer_keys = Array.from(new Set(merged));
          if (o?.buying_group_key) brands.buying_group_key = String(o.buying_group_key || '').trim().toLowerCase();
        }
      } catch {
        // ignore if not installed
      }
    }

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
      coords: {
        lat: Number.isFinite(coords.lat) ? coords.lat : null,
        lng: Number.isFinite(coords.lng) ? coords.lng : null,
        latKey: coords.latKey || '',
        lngKey: coords.lngKey || '',
        latKey_source: coords.latSource || '',
        lngKey_source: coords.lngSource || ''
      },
      dealer_schema: dealersSchema,
      dealer_import: dealersImp,
      backlog_rows: backlogRows,
      backlog_schema: backlogSchema,
      backlog_import: backlogImp,
      brands,
      config: {
        dealer_key: dealerKey,
        backlog_key: backlogKey,
        backlog_enabled: cfg.backlog_enabled !== false,
        backlog_group_enabled: cfg.backlog_group_enabled === true,
        backlog_group_by: cfg.backlog_group_by || '',
        dealer_columns: Array.isArray(cfg.dealer_columns) ? cfg.dealer_columns : null,
        backlog_columns: Array.isArray(cfg.backlog_columns) ? cfg.backlog_columns : null
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
