create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code in ('DE','AT','CH')),
  customer_number text not null,
  name text,
  street text,
  house_number text,
  postal_code text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dealers_country_customer_unique
  on public.dealers(country_code, customer_number);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dealers_set_updated_at on public.dealers;
create trigger dealers_set_updated_at
before update on public.dealers
for each row execute function public.set_updated_at();
