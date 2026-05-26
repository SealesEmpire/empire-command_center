-- Empire Command Center — core schema
-- projects ─< scenes ─< jobs / assets
--
-- Run against your Supabase project:
--   supabase db push          (CLI, recommended)
-- or paste into the SQL editor.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type project_status as enum ('draft', 'generating', 'assembling', 'completed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scene_status as enum ('pending', 'queued', 'generating', 'generated', 'approved', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('queued', 'in_progress', 'completed', 'failed', 'timed_out', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_kind as enum ('clip', 'final');
exception when duplicate_object then null; end $$;

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── projects ───────────────────────────────────────────────────────────────
create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  status            project_status not null default 'draft',
  final_object_key  text,
  final_video_url   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- ── scenes ───────────────────────────────────────────────────────────────
create table if not exists scenes (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  order_index        int not null default 0,
  title              text,
  prompt             text not null,
  negative_prompt    text not null default '',
  size               text not null default '1280*704',
  sample_steps       int not null default 30,
  seed               bigint,                       -- null = random per attempt
  task               text not null default 'ti2v-5B',
  status             scene_status not null default 'pending',
  approved_asset_id  uuid,                          -- FK added after assets exists
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_scenes_project on scenes(project_id, order_index);

drop trigger if exists trg_scenes_updated_at on scenes;
create trigger trg_scenes_updated_at before update on scenes
  for each row execute function set_updated_at();

-- ── jobs ───────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  scene_id        uuid not null references scenes(id) on delete cascade,
  runpod_job_id   text,
  status          job_status not null default 'queued',
  attempt         int not null default 1,
  params          jsonb not null default '{}'::jsonb,
  runpod_output   jsonb,
  error_code      text,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index if not exists idx_jobs_scene on jobs(scene_id, created_at desc);
create index if not exists idx_jobs_runpod on jobs(runpod_job_id);
create index if not exists idx_jobs_status on jobs(status);

drop trigger if exists trg_jobs_updated_at on jobs;
create trigger trg_jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ── assets ─────────────────────────────────────────────────────────────────
create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  scene_id      uuid references scenes(id) on delete cascade,   -- null for final
  job_id        uuid references jobs(id) on delete set null,
  kind          asset_kind not null default 'clip',
  object_key    text not null,
  url           text,
  url_type      text,
  size_bytes    bigint,
  duration_seconds numeric,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_assets_scene on assets(scene_id, created_at desc);
create index if not exists idx_assets_project on assets(project_id, kind);

-- approved_asset_id FK (now that assets exists)
do $$ begin
  alter table scenes
    add constraint scenes_approved_asset_fk
    foreign key (approved_asset_id) references assets(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── Row Level Security ─────────────────────────────────────────────────────
-- This is an internal operator tool. The Next.js server talks to Supabase with
-- the SERVICE ROLE key, which bypasses RLS. We enable RLS with NO public
-- policies so the anon/authenticated keys can read nothing by default.
-- Layer user-scoped policies here if/when you add multi-tenant auth.
alter table projects enable row level security;
alter table scenes   enable row level security;
alter table jobs     enable row level security;
alter table assets   enable row level security;
