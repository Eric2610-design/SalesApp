-- Optional: View für Händler ↔ Außendienst (Matching via PLZ-Prefix-Ranges)
create or replace view public.dealer_ad_matches as
select
  d.id as dealer_id,
  d.country_code,
  d.customer_number,
  d.name,
  d.street,
  d.house_number,
  d.postal_code,
  d.city,
  t.user_id as ad_user_id,
  t.prefix_len,
  t.from_prefix,
  t.to_prefix
from public.dealers d
join public.ad_territories t
  on t.country_code = d.country_code
  and length(regexp_replace(coalesce(d.postal_code,''), '\\D', '', 'g')) >= t.prefix_len
  and substring(
        regexp_replace(coalesce(d.postal_code,''), '\\D', '', 'g')
        from 1 for t.prefix_len
      )::int between t.from_prefix and t.to_prefix;
