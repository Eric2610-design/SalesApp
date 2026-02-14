export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireUserFromRequest } from '../../../../lib/authServer';

export async function GET(req) {
  const { user, profile, group, isAdmin, error } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });

  return Response.json({
    ok: true,
    user: { id: user.id, email: user.email },
    profile,
    group,
    isAdmin,
  });
}
