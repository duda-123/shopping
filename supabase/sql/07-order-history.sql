alter table public.market_orders
  add column history_hidden_at timestamptz,
  add column history_hidden_by uuid,
  add constraint market_orders_history_terminal_check check(history_hidden_at is null or status <> 'pending');
create index market_orders_visible_status_created on public.market_orders(status,created_at desc)
where history_hidden_at is null;
