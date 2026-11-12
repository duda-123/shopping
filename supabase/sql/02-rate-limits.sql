create table public.market_request_limits(bucket_key text primary key, window_start timestamptz not null, hits integer not null);
alter table public.market_request_limits enable row level security;
revoke all on public.market_request_limits from anon,authenticated;
grant all on public.market_request_limits to service_role;
create function public.market_rate_limit(bucket_key text,allowed_hits integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  insert into public.market_request_limits as limits values(bucket_key,now(),1)
  on conflict on constraint market_request_limits_pkey do update
  set hits=case when limits.window_start < now()-interval '1 minute' then 1 else limits.hits+1 end,
  window_start=case when limits.window_start < now()-interval '1 minute' then now() else limits.window_start end
  returning hits into n;
  delete from public.market_request_limits where window_start < now()-interval '1 day';
  return n <= allowed_hits;
end $$;
revoke all on function public.market_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.market_rate_limit(text,integer) to service_role;
