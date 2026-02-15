import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireAdminActionsKey(req) {
  const requiredKey = process.env.ADMIN_ACTIONS_KEY || '';
  const sentKey = req.headers.get('x-admin-actions-key') || '';
  if (requiredKey && sentKey !== requiredKey) {
    const err = new Error('Missing/invalid ADMIN_ACTIONS_KEY');
    err.status = 403;
    throw err;
  }
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  try {
    requireAdminActionsKey(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 });
  }

  const sql = `
create extension if not exists pgcrypto;

create table if not exists public.dataset_imports (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  filename text,
  mimetype text,
  row_count int default 0,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.dataset_rows (
  id bigserial primary key,
  import_id uuid references public.dataset_imports(id) on delete cascade,
  dataset text not null,
  row_index int not null,
  row_data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists dataset_rows_dataset_idx on public.dataset_rows(dataset);
create index if not exists dataset_rows_import_idx on public.dataset_rows(import_id);
`;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('exec_sql', { sql });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
