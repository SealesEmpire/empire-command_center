-- =====================================================================
-- Empire Command Center — Row Level Security
-- =====================================================================
-- Every table is scoped to org_id; users only see their own orgs.
-- Role-based write permissions: owner > admin > contributor > viewer
-- =====================================================================

-- Enable RLS everywhere
alter table public.organizations         enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.org_members           enable row level security;
alter table public.projects              enable row level security;
alter table public.documents             enable row level security;
alter table public.knowledge_chunks      enable row level security;
alter table public.tasks                 enable row level security;
alter table public.decisions             enable row level security;
alter table public.ideas                 enable row level security;
alter table public.activity_log          enable row level security;
alter table public.duplicate_detections  enable row level security;
alter table public.daily_reports         enable row level security;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.user_org_ids()
returns setof uuid language sql stable security definer as $$
    select org_id from public.org_members where user_id = auth.uid();
$$;

create or replace function public.user_role_in_org(p_org_id uuid)
returns org_role language sql stable security definer as $$
    select role from public.org_members
    where user_id = auth.uid() and org_id = p_org_id;
$$;

create or replace function public.can_write_org(p_org_id uuid)
returns boolean language sql stable security definer as $$
    select public.user_role_in_org(p_org_id) in ('owner','admin','contributor');
$$;

create or replace function public.can_admin_org(p_org_id uuid)
returns boolean language sql stable security definer as $$
    select public.user_role_in_org(p_org_id) in ('owner','admin');
$$;

-- ---------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------
create policy "Users see own profile"
    on public.user_profiles for select
    using (id = auth.uid());

create policy "Users update own profile"
    on public.user_profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());

-- Members of the same org can see each other (for assigning tasks etc)
create policy "Org members see each other"
    on public.user_profiles for select
    using (
        exists (
            select 1 from public.org_members om1
            join public.org_members om2 on om1.org_id = om2.org_id
            where om1.user_id = auth.uid() and om2.user_id = user_profiles.id
        )
    );

-- ---------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------
create policy "Members see their orgs"
    on public.organizations for select
    using (id in (select public.user_org_ids()));

create policy "Owners update their orgs"
    on public.organizations for update
    using (public.can_admin_org(id))
    with check (public.can_admin_org(id));

-- ---------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------
create policy "Members see other members in same org"
    on public.org_members for select
    using (org_id in (select public.user_org_ids()));

create policy "Admins manage memberships"
    on public.org_members for all
    using (public.can_admin_org(org_id))
    with check (public.can_admin_org(org_id));

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create policy "Members read their org projects"
    on public.projects for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ create projects"
    on public.projects for insert
    with check (public.can_write_org(org_id));

create policy "Contributors+ update projects"
    on public.projects for update
    using (public.can_write_org(org_id))
    with check (public.can_write_org(org_id));

create policy "Admins delete projects"
    on public.projects for delete
    using (public.can_admin_org(org_id));

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create policy "Members read org documents"
    on public.documents for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ add documents"
    on public.documents for insert
    with check (public.can_write_org(org_id));

create policy "Contributors+ update documents"
    on public.documents for update
    using (public.can_write_org(org_id))
    with check (public.can_write_org(org_id));

create policy "Admins delete documents"
    on public.documents for delete
    using (public.can_admin_org(org_id));

-- ---------------------------------------------------------------------
-- knowledge_chunks (mostly written by service_role)
-- ---------------------------------------------------------------------
create policy "Members read org knowledge"
    on public.knowledge_chunks for select
    using (org_id in (select public.user_org_ids()));

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create policy "Members read org tasks"
    on public.tasks for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ manage tasks"
    on public.tasks for all
    using (public.can_write_org(org_id))
    with check (public.can_write_org(org_id));

-- ---------------------------------------------------------------------
-- decisions
-- ---------------------------------------------------------------------
create policy "Members read org decisions"
    on public.decisions for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ log decisions"
    on public.decisions for insert
    with check (public.can_write_org(org_id));

create policy "Admins update decisions"
    on public.decisions for update
    using (public.can_admin_org(org_id))
    with check (public.can_admin_org(org_id));

-- ---------------------------------------------------------------------
-- ideas
-- ---------------------------------------------------------------------
create policy "Members read org ideas"
    on public.ideas for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ manage ideas"
    on public.ideas for all
    using (public.can_write_org(org_id))
    with check (public.can_write_org(org_id));

-- ---------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------
create policy "Members read org activity"
    on public.activity_log for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ write activity"
    on public.activity_log for insert
    with check (public.can_write_org(org_id));

-- ---------------------------------------------------------------------
-- duplicate_detections
-- ---------------------------------------------------------------------
create policy "Members read dup detections"
    on public.duplicate_detections for select
    using (org_id in (select public.user_org_ids()));

create policy "Contributors+ resolve dups"
    on public.duplicate_detections for update
    using (public.can_write_org(org_id))
    with check (public.can_write_org(org_id));

-- ---------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------
create policy "Members read org reports"
    on public.daily_reports for select
    using (org_id in (select public.user_org_ids()));
