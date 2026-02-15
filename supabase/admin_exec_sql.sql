-- Creates a SECURITY DEFINER function to run arbitrary SQL.
-- Use with care. Access is restricted in the app (admin + optional ADMIN_ACTIONS_KEY).

create or replace function public.exec_sql(sql text)
returns jsonb
language plpgsql
security definer
as $$
begin
  execute sql;
  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.exec_sql(text) from public;
grant execute on function public.exec_sql(text) to service_role;
