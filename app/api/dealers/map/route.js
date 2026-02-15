import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function normKey(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
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

function parseRawNumber(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;

  let raw = String(v).trim();
  if (!raw) return NaN;

  // tolerate common coordinate formats:
  // - decimal comma: "50,1109"
  // - DMS-ish strings containing °
  // - suffix/prefix letters: "50.1109 N", "E 8.6821", "lat:50.1109"
  // - german number formatting: "51.123.251,8"
  let sign = 1;
  if (/[sSwW]\b/.test(raw) || /[sSwW]$/.test(raw)) sign = -1;

  raw = raw
    .replace(/\s+/g, '')
    .replace(/°|º/g, '')
    .replace(/[NnEeSsWw]/g, '');

  // If both "." and "," exist: assume "." is thousands and "," is decimal.
  if (raw.includes('.') && raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(/,/g, '.');
  } else if (raw.includes(',') && !raw.includes('.')) {
    raw = raw.replace(/,/g, '.');
  }

  const m = raw.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!m) return NaN;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n * sign : NaN;
}

function isLat(n) {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}
function isLng(n) {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

function normalizeScaledCoord(n, kind) {
  if (!Number.isFinite(n)) return NaN;
  const limit = kind === 'lat' ? 90 : 180;
  if (Math.abs(n) <= limit) return n;

  // Many dealer exports store coordinates as integers with the decimal point removed
  // (e.g. 511232518 => 51.1232518). Some rows may have 6, 7, 14… implied decimals.
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);

  // Heuristic: choose the scaling that lands closest to Central Europe.
  // (Works well for DE/AT/CH datasets; still keeps values in valid coord ranges globally.)
  const center = kind === 'lat' ? 52 : 10;

  let best = null;
  for (let exp = 0; exp <= 15; exp++) {
    const v = abs / 10 ** exp;
    if (v > limit) continue;

    let score = Math.abs(v - center);
    // strongly penalize tiny coords that are "valid" but unrealistic for our domain
    if (v < 1) score += 100;
    // slight penalty for extreme edges
    if (kind === 'lat' && (v < 30 || v > 75)) score += 15;
    if (kind === 'lng' && (v < -20 || v > 40)) score += 8;

    if (!best || score < best.score) best = { v, exp, score };
  }

  return best ? best.v * sign : NaN;
}

function parseCoord(v, kind) {
  const n = parseRawNumber(v);
  return normalizeScaledCoord(n, kind);
}

function pickName(row) {
  const obj = row?.row_data || {};
  const keys = Object.keys(obj);
  const pref = ['Name', 'Firmenname', 'Firma', 'Händlername', 'Haendlername', 'Shop', 'Store', 'Unternehmen', 'company'];
  for (const p of pref) {
    const k = keys.find((x) => x.toLowerCase() === p.toLowerCase());
    if (k && obj[k]) return String(obj[k]);
  }
  const re = /(name|firma|haendler|händler|shop|store|company)/i;
  const hit = keys.find((k) => re.test(k) && obj[k]);
  if (hit) return String(obj[hit]);
  return `Händler #${(row?.row_index ?? 0) + 1}`;
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

function candidateLatKeys(keys) {
  const scored = [];
  for (const k of keys) {
    const kk = k.toLowerCase();
    let score = 0;
    if (kk === 'lat' || kk === 'latitude') score += 10;
    if (kk === 'lt') score += 9;
    if (kk.endsWith('_lt')) score += 5;
    if (kk.includes('lat')) score += 6;
    if (kk.includes('breit')) score += 6;
    if (kk.includes('y')) score += 1;
    if (score) scored.push({ k, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.k);
}

function candidateLngKeys(keys) {
  const scored = [];
  for (const k of keys) {
    const kk = k.toLowerCase();
    let score = 0;
    if (kk === 'lng' || kk === 'lon' || kk === 'longitude') score += 10;
    if (kk === 'ln') score += 9;
    if (kk.endsWith('_ln')) score += 5;
    if (kk.includes('lng') || kk.includes('lon') || kk.includes('long')) score += 6;
    if (kk.includes('läng')) score += 6;
    if (kk.includes('x')) score += 1;
    if (score) scored.push({ k, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.k);
}

function findLatLng(obj, preferredLat, preferredLng) {
  const keys = Object.keys(obj || {});
  const latCandidates = [...new Set([...(preferredLat || []), ...candidateLatKeys(keys)])];
  const lngCandidates = [...new Set([...(preferredLng || []), ...candidateLngKeys(keys)])];

  for (const lk of latCandidates) {
    const n = parseCoord(obj[lk], 'lat');
    if (!isLat(n)) continue;
    for (const gk of lngCandidates) {
      const m = parseCoord(obj[gk], 'lng');
      if (isLng(m)) return { lat: n, lng: m, latKey: lk, lngKey: gk };
    }
  }

  // Fallback: try any pair of numeric values that look like coordinates
  for (const lk of keys) {
    const n = parseCoord(obj[lk], 'lat');
    if (!isLat(n)) continue;
    for (const gk of keys) {
      if (gk === lk) continue;
      const m = parseCoord(obj[gk], 'lng');
      if (isLng(m)) return { lat: n, lng: m, latKey: lk, lngKey: gk };
    }
  }



  // Fallback: single column containing "lat,lng" or "lat lng" (common in exports)
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const s = String(v);
    const nums = s.replace(/,/g, '.').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!nums || nums.length < 2) continue;
    const a = parseCoord(nums[0], 'lat');
    const b = parseCoord(nums[1], 'lng');
    if (isLat(a) && isLng(b)) return { lat: a, lng: b, latKey: k, lngKey: k };
    // swapped order
    const aa = parseCoord(nums[0], 'lng');
    const bb = parseCoord(nums[1], 'lat');
    if (isLat(bb) && isLng(aa)) return { lat: bb, lng: aa, latKey: k, lngKey: k };
  }

  return { lat: NaN, lng: NaN, latKey: '', lngKey: '' };
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

async function getPageConfig(admin, key) {
  const { data, error } = await admin
    .from('page_configs')
    .select('key,config')
    .eq('key', key)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.config || null;
}

async function getDatasetViewConfig(admin, dataset) {
  const { data, error } = await admin
    .from('dataset_schemas')
    .select('dataset,view_config')
    .eq('dataset', dataset)
    .limit(1);
  if (error) return null; // optional table
  return data?.[0]?.view_config || null;
}

async function fetchAllRows(admin, importId, batch = 1000, max = 25000) {
  const out = [];
  let from = 0;
  while (out.length < max) {
    const to = Math.min(from + batch - 1, max - 1);
    const { data, error } = await admin
      .from('dataset_rows')
      .select('row_index,row_data')
      .eq('import_id', importId)
      .order('row_index', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = data || [];
    out.push(...rows);
    if (rows.length < batch) break;
    from += batch;
  }
  return out;
}

function guessLatLngKeysFromSample(rows) {
  const latScore = new Map();
  const lngScore = new Map();

  for (const r of (rows || []).slice(0, 300)) {
    const obj = r?.row_data || {};
    const keys = Object.keys(obj);
    const latCandidates = candidateLatKeys(keys);
    const lngCandidates = candidateLngKeys(keys);

    for (const k of latCandidates) {
      const n = parseCoord(obj[k], 'lat');
      if (isLat(n)) latScore.set(k, (latScore.get(k) || 0) + 1);
    }
    for (const k of lngCandidates) {
      const n = parseCoord(obj[k], 'lng');
      if (isLng(n)) lngScore.set(k, (lngScore.get(k) || 0) + 1);
    }
  }

  const best = (m) => {
    let top = { k: '', v: 0 };
    for (const [k, v] of m.entries()) {
      if (v > top.v) top = { k, v };
    }
    return top.k;
  };
  return { latKey: best(latScore), lngKey: best(lngScore) };
}

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });

  const url = new URL(req.url);
  const onlyBacklog = url.searchParams.get('onlyBacklog') === '1';

  const admin = getSupabaseAdmin();
  try {
    const [dealersImp, backlogImp, cfgRaw, dealersViewCfgRaw] = await Promise.all([
      getLatestImport(admin, 'dealers'),
      getLatestImport(admin, 'backlog'),
      getPageConfig(admin, 'dealer_view'),
      getDatasetViewConfig(admin, 'dealers')
    ]);

    if (!dealersImp?.id) {
      return NextResponse.json({ import: null, markers: [], counts: { total: 0, with_coords: 0, no_coords: 0 } });
    }

    const cfg = (cfgRaw && typeof cfgRaw === 'object') ? cfgRaw : {};
    const dealersViewCfg = (dealersViewCfgRaw && typeof dealersViewCfgRaw === 'object') ? dealersViewCfgRaw : {};
    const geoCfg = (dealersViewCfg.geo && typeof dealersViewCfg.geo === 'object') ? dealersViewCfg.geo : {};
    const brandsCfg = (dealersViewCfg.brands && typeof dealersViewCfg.brands === 'object') ? dealersViewCfg.brands : {};
    const geoMode = String(geoCfg.mode || 'auto');

    // Load a sample for key guessing
    const { data: sampleRows, error: sampleErr } = await admin
      .from('dataset_rows')
      .select('row_index,row_data')
      .eq('import_id', dealersImp.id)
      .order('row_index', { ascending: true })
      .limit(300);
    if (sampleErr) throw new Error(sampleErr.message);
    const sample0 = sampleRows?.[0] || null;

    const dealerKey = cfg.dealer_key || guessKey(sample0?.row_data || {}, ['Kundennummer', 'KundenNr', 'Kunde', 'Händlernummer', 'Haendlernummer']);
    const backlogKey = cfg.backlog_key || 'Kundennummer';
    const { latKey: autoLatKey, lngKey: autoLngKey } = guessLatLngKeysFromSample(sampleRows || []);

    const sampleKeys = Object.keys(sample0?.row_data || {});
    const resolveKey = (wanted) => {
      const w = String(wanted || '').trim();
      if (!w) return '';
      const hit = sampleKeys.find((k) => k.toLowerCase() === w.toLowerCase());
      return hit || '';
    };

    const manualLatKey = (geoMode === 'manual') ? resolveKey(geoCfg.lat_field) : '';
    const manualLngKey = (geoMode === 'manual') ? resolveKey(geoCfg.lng_field) : '';

    const finalLatKey = manualLatKey || autoLatKey || '';
    const finalLngKey = manualLngKey || autoLngKey || '';

    // Backlog presence map
    const backlogSet = new Set();
    if (backlogImp?.id) {
      const backlogRows = await fetchAllRows(admin, backlogImp.id, 1200, 40000);
      for (const r of backlogRows) {
        const k = normKey((r?.row_data || {})[backlogKey]);
        if (k) backlogSet.add(k);
      }
    }

    // Dealers
    const dealerRows = await fetchAllRows(admin, dealersImp.id, 1200, 40000);
    const markers = [];
    let noCoords = 0;

    for (const r of dealerRows) {
      const obj = r?.row_data || {};
      const coords = findLatLng(obj, finalLatKey ? [finalLatKey] : [], finalLngKey ? [finalLngKey] : []);
      if (!isLat(coords.lat) || !isLng(coords.lng)) {
        noCoords++;
        continue;
      }
      const dVal = normKey(obj?.[dealerKey]);
      const hasBacklog = dVal ? backlogSet.has(dVal) : false;
      if (onlyBacklog && !hasBacklog) continue;

      markers.push({
        id: r.row_index,
        name: pickName(r),
        lat: coords.lat,
        lng: coords.lng,
        hasBacklog,
        manufacturer_keys: parseBrandKeys(obj, brandsCfg),
        buying_group_key: parseBuyingGroupKey(obj, brandsCfg),
        // a few helpful fields for the list (optional)
        city: obj?.Ort ?? obj?.City ?? obj?.city ?? null,
        zip: obj?.PLZ ?? obj?.Zip ?? obj?.zip ?? null
      });
    }

    return NextResponse.json({
      import: dealersImp,
      markers,
      counts: {
        total: dealerRows.length,
        with_coords: dealerRows.length - noCoords,
        no_coords: noCoords
      },
      config: {
        dealerKey,
        backlogKey,
        geoMode,
        latKey: finalLatKey || '',
        lngKey: finalLngKey || '',
        latKey_source: manualLatKey ? 'manual' : (autoLatKey ? 'auto' : ''),
        lngKey_source: manualLngKey ? 'manual' : (autoLngKey ? 'auto' : '')
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
