-- Manager bot knowledge / instructions, editable from the dashboard.
-- Singleton row (id = 'default'); the Next.js server reads/writes it with the
-- service role key and appends it to the Manager's system prompt.

create table if not exists manager_settings (
  id           text primary key default 'default',
  instructions text not null default '',
  updated_at   timestamptz not null default now()
);

insert into manager_settings (id, instructions)
  values ('default', '')
  on conflict (id) do nothing;

drop trigger if exists trg_manager_settings_updated_at on manager_settings;
create trigger trg_manager_settings_updated_at before update on manager_settings
  for each row execute function set_updated_at();

alter table manager_settings enable row level security;
