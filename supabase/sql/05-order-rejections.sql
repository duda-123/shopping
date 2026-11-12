alter table public.market_orders drop constraint market_orders_status_check;
alter table public.market_orders
  add column rejection_reason text,
  add column rejected_at timestamptz,
  add column rejected_by uuid,
  add constraint market_orders_status_check check(status in ('pending','cancelled','fulfilled','rejected')),
  add constraint market_orders_rejection_reason_check check(
    status <> 'rejected' or (rejection_reason is not null and length(btrim(rejection_reason)) between 1 and 500)
  );

create or replace function public.market_cancel_order(code_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target public.market_orders; result record;
begin
  select * into target from public.market_orders where receipt_hash=code_hash;
  if not found then raise exception '未找到订单'; end if;
  insert into public.market_ip_rules(ip_hash) values(target.ip_hash) on conflict do nothing;
  perform 1 from public.market_ip_rules where ip_hash=target.ip_hash for update;
  select * into target from public.market_orders where id=target.id for update;
  if target.status not in ('pending','cancelled') then
    raise exception '订单已完成或被拒绝，无法取消';
  end if;
  if target.status='cancelled' then return jsonb_build_object('cancelled',true,'already_cancelled',true); end if;
  update public.market_orders set status='cancelled' where id=target.id;
  update public.market_ip_rules set cancel_streak=cancel_streak+1, blocked=(cancel_streak+1>=3), updated_at=now()
    where ip_hash=target.ip_hash returning cancel_streak,blocked into result;
  return jsonb_build_object('cancelled',true,'streak',result.cancel_streak,'blocked',result.blocked);
end $$;
revoke all on function public.market_cancel_order(text) from public,anon,authenticated;
grant execute on function public.market_cancel_order(text) to service_role;
