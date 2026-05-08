-- =====================================================================
-- Empire Command Center — Schema
-- Seale's Empire LLC
-- =====================================================================
-- A unified knowledge + task + document management system
-- for managing multiple connected projects (FDDY, Hub Wallet, Nexus, etc.)
-- with semantic deduplication and AI-powered organization.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";
create extension if not exists "vector";   -- pgvector for semantic search

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type org_role as enum ('owner', 'admin', 'contributor', 'viewer');

create type project_phase as enum (
    'idea',
    'design',
    'in_development',
    'pre_launch',
    'launched',
    'maintenance',
    'archived'
);

create type project_health as enum ('on_track', 'needs_attention', 'blocked', 'paused');

create type task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type task_source as enum ('manual', 'extracted', 'inferred');

create type document_type as enum (
    'spec',           -- product specs, technical docs
    'legal',          -- legal reviews, contracts, compliance
    'code',           -- code snippets, scripts
    'screenshot',     -- UI screenshots, diagrams
    'flow_chart',     -- flow charts, architecture diagrams
    'pitch',          -- pitch decks, investor docs
    'financial',      -- money flows, projections, P&L
    'meeting_notes',  -- transcripts, meeting summaries
    'idea',           -- raw ideas, brainstorms
    'reference',      -- external articles, links
    'other'
);

create type idea_status as enum (
    'parking_lot',    -- raw idea, not yet evaluated
    'researching',    -- being investigated
    'promoted',       -- promoted to a real project
    'declined',       -- evaluated and declined
    'merged'          -- merged into existing project
);

create type activity_type as enum (
    'document_added',
    'task_created',
    'task_completed',
    'decision_logged',
    'idea_captured',
    'project_phase_changed',
    'kb_updated',
    'duplicate_detected',
    'note_added'
);

-- =====================================================================
-- ORGANIZATIONS & USERS (multi-tenant from day 1)
-- =====================================================================

-- One row per workspace. Jesse's workspace is the seed entry.
create table public.organizations (
    id              uuid primary key default uuid_generate_v4(),
    name            text not null,
    slug            citext unique not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.organizations is 'Workspaces. Each user belongs to one or more orgs.';

create table public.user_profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    full_name       text,
    email           citext unique,
    avatar_url      text,
    created_at      timestamptz not null default now()
);

create table public.org_members (
    org_id          uuid not null references public.organizations(id) on delete cascade,
    user_id         uuid not null references public.user_profiles(id) on delete cascade,
    role            org_role not null default 'contributor',
    joined_at       timestamptz not null default now(),
    primary key (org_id, user_id)
);

create index idx_org_members_user on public.org_members(user_id);

-- =====================================================================
-- PROJECTS
-- =====================================================================

create table public.projects (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    name            text not null,
    slug            citext not null,
    description     text,
    phase           project_phase not null default 'idea',
    health          project_health not null default 'on_track',
    color           text default '#00D8FF',           -- for UI badge
    icon            text default '🚀',                 -- emoji for quick recognition
    next_milestone  text,
    next_milestone_date date,
    percent_complete  integer default 0 check (percent_complete between 0 and 100),
    summary         text,                              -- AI-generated rolling summary
    summary_updated_at timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    archived_at     timestamptz,
    unique (org_id, slug)
);

create index idx_projects_org on public.projects(org_id);
create index idx_projects_phase on public.projects(phase);
create index idx_projects_health on public.projects(health);

comment on table public.projects is 'Top-level projects (FDDY, Hub Wallet, Nexus, future).';

-- =====================================================================
-- DOCUMENTS — every file/text/image dropped into the system
-- =====================================================================

create table public.documents (
    id                  uuid primary key default uuid_generate_v4(),
    org_id              uuid not null references public.organizations(id) on delete cascade,
    project_id          uuid references public.projects(id) on delete set null,
    title               text not null,
    document_type       document_type not null default 'other',
    -- Content storage
    storage_path        text,                          -- file in Supabase Storage
    file_hash           text,                          -- SHA-256 for exact-dup detection
    mime_type           text,
    size_bytes          bigint,
    -- Extracted text (PDFs, images via OCR, etc.)
    extracted_text      text,                          -- searchable text content
    summary             text,                          -- AI-generated summary
    -- Metadata
    source              text,                          -- 'upload' | 'paste' | 'voice' | 'url'
    source_url          text,
    tags                text[] default '{}',
    -- Audit
    uploaded_by         uuid references public.user_profiles(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index idx_documents_org_project on public.documents(org_id, project_id);
create index idx_documents_type on public.documents(document_type);
create index idx_documents_hash on public.documents(file_hash) where file_hash is not null;
create index idx_documents_tags on public.documents using gin(tags);
create index idx_documents_text on public.documents using gin(to_tsvector('english', coalesce(extracted_text, '')));

comment on table public.documents is 'Every file/text dropped into the command center.';

-- =====================================================================
-- KNOWLEDGE_CHUNKS — the running KB, embedded for semantic search/dedup
-- =====================================================================

create table public.knowledge_chunks (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    project_id      uuid references public.projects(id) on delete set null,
    document_id     uuid references public.documents(id) on delete cascade,
    section         text,                              -- e.g. "Path 2 Money Flow"
    content         text not null,                     -- ~500 word chunk
    embedding       vector(1536),                      -- OpenAI ada-002 / text-embedding-3 size
    chunk_index     integer not null default 0,        -- ordering within source
    metadata        jsonb default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

-- ivfflat is fast and good enough; switch to hnsw at scale
create index idx_knowledge_chunks_embedding
    on public.knowledge_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create index idx_knowledge_chunks_org_project on public.knowledge_chunks(org_id, project_id);
create index idx_knowledge_chunks_document on public.knowledge_chunks(document_id);

comment on table public.knowledge_chunks is 'Embedded text chunks for semantic search and deduplication.';

-- =====================================================================
-- TASKS
-- =====================================================================

create table public.tasks (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    project_id      uuid references public.projects(id) on delete set null,
    parent_task_id  uuid references public.tasks(id) on delete cascade,
    title           text not null,
    description     text,
    status          task_status not null default 'todo',
    priority        task_priority not null default 'medium',
    source          task_source not null default 'manual',
    -- Source tracking
    source_document_id uuid references public.documents(id) on delete set null,
    extracted_from_text text,                          -- the snippet that generated this task
    -- Scheduling
    due_date        date,
    completed_at    timestamptz,
    -- Order in lists
    sort_order      integer default 0,
    -- People
    assigned_to     uuid references public.user_profiles(id),
    created_by      uuid references public.user_profiles(id),
    -- Audit
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_tasks_org_project on public.tasks(org_id, project_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_priority on public.tasks(priority);
create index idx_tasks_due_date on public.tasks(due_date) where due_date is not null;
create index idx_tasks_assigned on public.tasks(assigned_to) where assigned_to is not null;

comment on table public.tasks is 'To-do items, may be linked to documents that generated them.';

-- =====================================================================
-- DECISIONS — formal decision log
-- =====================================================================

create table public.decisions (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    project_id      uuid references public.projects(id) on delete set null,
    title           text not null,
    decision        text not null,                     -- what was decided
    rationale       text,                              -- why
    alternatives    text,                              -- what was considered and rejected
    decided_by      uuid references public.user_profiles(id),
    decided_at      timestamptz not null default now(),
    revisited_at    timestamptz,                       -- if reopened later
    related_documents uuid[] default '{}',
    tags            text[] default '{}',
    created_at      timestamptz not null default now()
);

create index idx_decisions_org_project on public.decisions(org_id, project_id);
create index idx_decisions_date on public.decisions(decided_at desc);

comment on table public.decisions is 'Formal decision log per project.';

-- =====================================================================
-- IDEAS — the parking lot
-- =====================================================================

create table public.ideas (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    title           text not null,
    description     text,
    status          idea_status not null default 'parking_lot',
    related_project_id uuid references public.projects(id) on delete set null,
    promoted_to_project_id uuid references public.projects(id) on delete set null,
    tags            text[] default '{}',
    captured_by     uuid references public.user_profiles(id),
    captured_at     timestamptz not null default now(),
    promoted_at     timestamptz,
    notes           text,
    embedding       vector(1536)                       -- for finding similar ideas
);

create index idx_ideas_org on public.ideas(org_id);
create index idx_ideas_status on public.ideas(status);
create index idx_ideas_embedding
    on public.ideas
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 50);

comment on table public.ideas is 'Parking lot for raw ideas before they become projects.';

-- =====================================================================
-- ACTIVITY LOG — chronological event stream
-- =====================================================================

create table public.activity_log (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    project_id      uuid references public.projects(id) on delete set null,
    user_id         uuid references public.user_profiles(id),
    activity_type   activity_type not null,
    summary         text not null,                     -- "Added contract.pdf to FDDY"
    detail          jsonb default '{}'::jsonb,
    related_document_id uuid references public.documents(id) on delete set null,
    related_task_id     uuid references public.tasks(id)     on delete set null,
    created_at      timestamptz not null default now()
);

create index idx_activity_org_project on public.activity_log(org_id, project_id, created_at desc);
create index idx_activity_type on public.activity_log(activity_type);

comment on table public.activity_log is 'Chronological event feed; powers dashboard activity widget.';

-- =====================================================================
-- DUPLICATE_DETECTIONS — pending merge decisions
-- =====================================================================

create table public.duplicate_detections (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    new_document_id uuid not null references public.documents(id) on delete cascade,
    similar_chunk_id uuid references public.knowledge_chunks(id) on delete cascade,
    existing_document_id uuid references public.documents(id) on delete cascade,
    similarity_score numeric(4,3),                     -- 0.000-1.000
    diff_summary    text,                              -- AI-generated "what's new" summary
    resolution      text check (resolution in ('pending','merged','rejected_keep_both','rejected_discard_new')),
    resolved_at     timestamptz,
    resolved_by     uuid references public.user_profiles(id),
    created_at      timestamptz not null default now()
);

create index idx_dup_pending on public.duplicate_detections(org_id) where resolution = 'pending';

-- =====================================================================
-- DAILY_REPORTS — generated each morning
-- =====================================================================

create table public.daily_reports (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    report_date     date not null,
    content         text not null,                     -- markdown report
    metrics         jsonb default '{}'::jsonb,         -- raw counts/stats
    generated_at    timestamptz not null default now(),
    unique (org_id, report_date)
);

create index idx_reports_org_date on public.daily_reports(org_id, report_date desc);

-- =====================================================================
-- TRIGGERS — keep updated_at fresh
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
declare t text;
begin
    foreach t in array array['organizations','projects','documents','tasks'] loop
        execute format(
            'create trigger trg_%I_updated_at before update on public.%I '
            'for each row execute function public.set_updated_at();', t, t);
    end loop;
end$$;

-- =====================================================================
-- AUTO-CREATE USER PROFILE + DEFAULT ORG on signup
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_org_id uuid;
begin
    -- Create user profile
    insert into public.user_profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
    )
    on conflict (id) do nothing;

    -- Create personal org for them
    insert into public.organizations (name, slug)
    values (
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)) || '''s Empire',
        'empire-' || substr(new.id::text, 1, 8)
    )
    returning id into v_org_id;

    -- Make them owner
    insert into public.org_members (org_id, user_id, role)
    values (v_org_id, new.id, 'owner');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
