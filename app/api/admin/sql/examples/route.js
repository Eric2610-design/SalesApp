import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const root = process.cwd();
  const dir = path.join(root, 'supabase');

  const files = [
    { name: '00 core users', file: 'core_users.sql' },
    { name: '01 exec_sql function', file: 'admin_exec_sql.sql' },
    { name: '02 apps registry', file: 'apps_registry.sql' },
    { name: '03 import tables', file: 'import_tables.sql' },
    { name: '04 manufacturers + buying groups', file: 'brands.sql' },
    { name: '05 dealer brand overrides', file: 'dealer_brand_overrides.sql' },
    { name: '06 user territories', file: 'user_territories.sql' }
  ];

  const examples = [];
  for (const f of files) {
    const p = path.join(dir, f.file);
    try {
      examples.push({ name: f.name, sql: fs.readFileSync(p, 'utf8') });
    } catch {}
  }

  return NextResponse.json({ examples });
}
