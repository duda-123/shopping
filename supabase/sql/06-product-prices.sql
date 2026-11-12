-- MXN is authoritative. Existing products and historical orders remain unpriced.
alter table public.market_products add column price_cents integer check(price_cents between 0 and 99999999);
alter table public.market_orders
  add column total_mxn_cents bigint check(total_mxn_cents >= 0),
  add column total_cny_cents bigint check(total_cny_cents >= 0),
  add column fx_rate numeric check(fx_rate > 0),
  add column fx_date date,
  add column fx_source text;
