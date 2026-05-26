-- Multi-modal + money layer.
--   jobs.worker_type   — which bot ran the job (video, image, ...)
--   assets.media_type  — what the asset is (video, image, audio, ...)
--   asset_kind += image
--   ledger             — cost & revenue events; the spine of "self-sustaining"

alter table jobs   add column if not exists worker_type text not null default 'video';
alter table assets add column if not exists media_type  text not null default 'video';

-- Extend asset_kind with 'image' (no-op if already present).
alter type asset_kind add value if not exists 'image';

do $$ begin
  create type ledger_kind as enum ('cost', 'revenue');
exception when duplicate_object then null; end $$;

create table if not exists ledger (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete set null,
  kind        ledger_kind not null,
  source      text not null,            -- e.g. video_generation, image_generation, sale
  amount_usd  numeric(12,4) not null default 0,
  description text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ledger_project on ledger(project_id);
create index if not exists idx_ledger_kind on ledger(kind);
create index if not exists idx_ledger_created on ledger(created_at desc);

alter table ledger enable row level security;
