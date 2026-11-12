-- Isolated tables: existing application tables are left untouched.
create table public.market_staff (
  role text primary key check (role in ('admin','supplier')),
  user_id uuid unique not null references auth.users(id),
  username text unique not null,
  must_change boolean not null default true,
  token_valid_after bigint not null default 0
);
create table public.market_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  unit text not null check (length(unit) between 1 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.market_orders (
  id uuid primary key,
  receipt_hash text not null,
  customer text not null check (length(customer) between 1 and 60),
  phone text not null check (length(phone) between 5 and 40),
  address text not null check (length(address) between 5 and 300),
  region text not null check (region in ('将军镇','华富山','波瓦达波','机场','阿波达卡')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  created_at timestamptz not null default now()
);
create index market_orders_region_created on public.market_orders(region, created_at desc);
create unique index market_orders_receipt on public.market_orders(receipt_hash);
alter table public.market_staff enable row level security;
alter table public.market_products enable row level security;
alter table public.market_orders enable row level security;
revoke all on public.market_staff, public.market_products, public.market_orders from anon, authenticated;
grant all on public.market_staff, public.market_products, public.market_orders to service_role;
-- All access is validated in market-api; no public customer/address reads.
insert into public.market_products(name,unit) values
('上海青','把'),('西红柿','公斤'),('土豆','公斤'),('胡萝卜','公斤'),
('黄瓜','公斤'),('西兰花','颗'),('大白菜','颗'),('生姜','公斤'),
('大蒜','公斤'),('小葱','把'),('香菜','把'),('白萝卜','公斤');
