-- Optional: link Supabase auth users to app_users

alter table public.app_users
add column if not exists auth_user_id uuid unique;

-- Link by email (run after users exist in auth.users):
-- update public.app_users au
-- set auth_user_id = u.id
-- from auth.users u
-- where lower(u.email) = lower(au.email) and au.auth_user_id is null;
