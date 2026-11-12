alter table public.market_orders add column receipt_code text not null, add column ip_hash text not null,
add column status text not null default 'pending' check(status in ('pending','cancelled','fulfilled'));
create unique index market_orders_code on public.market_orders(receipt_code);
create table public.market_ip_rules(ip_hash text primary key, cancel_streak integer not null default 0, blocked boolean not null default false, updated_at timestamptz not null default now());
alter table public.market_ip_rules enable row level security;
revoke all on public.market_ip_rules from anon,authenticated;
grant all on public.market_ip_rules to service_role;
create function public.market_cancel_order(code_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.market_orders; result record;
begin
select * into target from public.market_orders where receipt_hash=code_hash;
if not found then raise exception '未找到订单'; end if;
insert into public.market_ip_rules(ip_hash) values(target.ip_hash) on conflict do nothing;
perform 1 from public.market_ip_rules where ip_hash=target.ip_hash for update;
select * into target from public.market_orders where id=target.id for update;
if target.status='fulfilled' then raise exception '订单已完成配送，无法取消'; end if;
if target.status='cancelled' then return jsonb_build_object('cancelled',true,'already_cancelled',true); end if;
update public.market_orders set status='cancelled' where id=target.id;
update public.market_ip_rules set cancel_streak=cancel_streak+1, blocked=(cancel_streak+1>=3), updated_at=now() where ip_hash=target.ip_hash returning cancel_streak,blocked into result;
return jsonb_build_object('cancelled',true,'streak',result.cancel_streak,'blocked',result.blocked);
end $$;
create function public.market_fulfill_order(order_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare target public.market_orders;
begin
select * into target from public.market_orders where id=order_id;
if not found then raise exception '未找到订单'; end if;
insert into public.market_ip_rules(ip_hash) values(target.ip_hash) on conflict do nothing;
perform 1 from public.market_ip_rules where ip_hash=target.ip_hash for update;
select * into target from public.market_orders where id=order_id for update;
if target.status<>'pending' then raise exception '仅待配送订单可标记完成'; end if;
update public.market_orders set status='fulfilled' where id=order_id;
update public.market_ip_rules set cancel_streak=0,updated_at=now() where ip_hash=target.ip_hash;
return true;
end $$;
revoke all on function public.market_cancel_order(text),public.market_fulfill_order(uuid) from public,anon,authenticated;
grant execute on function public.market_cancel_order(text),public.market_fulfill_order(uuid) to service_role;
