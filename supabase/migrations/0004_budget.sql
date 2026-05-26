-- Spend guardrail. Singleton row holds a monthly GPU spend cap (USD).
-- 0 = unlimited. Generations are blocked once the current calendar month's
-- recorded cost reaches the cap.

create table if not exists budget (
  id              text primary key default 'default',
  monthly_cap_usd numeric(12,2) not null default 0,
  updated_at      timestamptz not null default now()
);

insert into budget (id, monthly_cap_usd)
  values ('default', 0)
  on conflict (id) do nothing;

drop trigger if exists trg_budget_updated_at on budget;
create trigger trg_budget_updated_at before update on budget
  for each row execute function set_updated_at();

alter table budget enable row level security;
