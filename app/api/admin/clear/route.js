export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

function requireAdminKey(req) {
  const expected = process.env.ADMIN_ACTIONS_KEY;
  if (!expected) {
    return { ok: false, error: 'Server misconfigured: ADMIN_ACTIONS_KEY is not set.' };
  }

  const provided = req.headers.get('x-admin-key') || '';
  if (!provided || provided !== expected) {
    return { ok: false, error: 'Unauthorized: invalid admin key.' };
  }

  return { ok: true };
}

async function countRows(supabase, table, filter) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count || 0;
}

async function deleteRows(supabase, table, filter) {
  let q = supabase.from(table).delete();
  if (filter) q = filter(q);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function POST(req) {
  try {
    const auth = requireAdminKey(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

    const body = await req.json();
    const target = String(body?.target || '').trim();

    if (!['dealers', 'backlog', 'inventory', 'all_data'].includes(target)) {
      return Response.json({ error: 'Unknown target' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Supabase JS delete requires a filter; this condition is always true.
    const always = (q) => q.neq('id', '00000000-0000-0000-0000-000000000000');

    const res = { ok: true, target };

    if (target === 'dealers' || target === 'all_data') {
      res.dealers_count = await countRows(supabase, 'dealers', always);
      await deleteRows(supabase, 'dealers', (q) => q.neq('country_code', ''));
    }

    if (target === 'backlog' || target === 'all_data') {
      res.backlog_rows_count = await countRows(supabase, 'backlog_rows', always);
      res.backlog_imports_count = await countRows(supabase, 'backlog_imports', always);
      await deleteRows(supabase, 'backlog_rows', always);
      await deleteRows(supabase, 'backlog_imports', always);
    }

    if (target === 'inventory' || target === 'all_data') {
      res.inventory_rows_count = await countRows(supabase, 'inventory_rows', always);
      res.inventory_imports_count = await countRows(supabase, 'inventory_imports', always);
      await deleteRows(supabase, 'inventory_rows', always);
      await deleteRows(supabase, 'inventory_imports', always);
    }

    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
