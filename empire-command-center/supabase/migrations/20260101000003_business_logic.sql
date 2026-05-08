-- =====================================================================
-- Empire Command Center — Business Logic
-- =====================================================================

-- ---------------------------------------------------------------------
-- find_similar_chunks — semantic search, used by ingestion pipeline
-- ---------------------------------------------------------------------
create or replace function public.find_similar_chunks(
    p_org_id          uuid,
    p_query_embedding vector(1536),
    p_threshold       numeric default 0.85,
    p_limit           integer default 5
) returns table (
    chunk_id        uuid,
    document_id     uuid,
    document_title  text,
    project_id      uuid,
    section         text,
    content         text,
    similarity      numeric
) language plpgsql stable security definer set search_path = public as $$
begin
    return query
    select
        kc.id,
        kc.document_id,
        d.title,
        kc.project_id,
        kc.section,
        kc.content,
        (1 - (kc.embedding <=> p_query_embedding))::numeric as similarity
    from public.knowledge_chunks kc
    join public.documents d on d.id = kc.document_id
    where kc.org_id = p_org_id
      and kc.embedding is not null
      and (1 - (kc.embedding <=> p_query_embedding)) > p_threshold
    order by kc.embedding <=> p_query_embedding
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- find_similar_ideas — used when capturing a new idea to suggest merges
-- ---------------------------------------------------------------------
create or replace function public.find_similar_ideas(
    p_org_id          uuid,
    p_query_embedding vector(1536),
    p_threshold       numeric default 0.80,
    p_limit           integer default 3
) returns table (
    idea_id     uuid,
    title       text,
    description text,
    similarity  numeric,
    status      idea_status
) language plpgsql stable security definer set search_path = public as $$
begin
    return query
    select
        i.id,
        i.title,
        i.description,
        (1 - (i.embedding <=> p_query_embedding))::numeric as similarity,
        i.status
    from public.ideas i
    where i.org_id = p_org_id
      and i.embedding is not null
      and (1 - (i.embedding <=> p_query_embedding)) > p_threshold
    order by i.embedding <=> p_query_embedding
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- get_project_status — single-call project summary for dashboard
-- ---------------------------------------------------------------------
create or replace function public.get_project_status(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'project', row_to_json(p),
        'task_counts', jsonb_build_object(
            'todo',        (select count(*) from public.tasks where project_id = p.id and status = 'todo'),
            'in_progress', (select count(*) from public.tasks where project_id = p.id and status = 'in_progress'),
            'blocked',     (select count(*) from public.tasks where project_id = p.id and status = 'blocked'),
            'done',        (select count(*) from public.tasks where project_id = p.id and status = 'done')
        ),
        'document_count', (select count(*) from public.documents where project_id = p.id),
        'decision_count', (select count(*) from public.decisions where project_id = p.id),
        'last_activity_at', (
            select max(created_at) from public.activity_log where project_id = p.id
        ),
        'recent_activity', (
            select coalesce(jsonb_agg(row_to_json(a) order by a.created_at desc), '[]'::jsonb)
            from (
                select * from public.activity_log
                where project_id = p.id
                order by created_at desc
                limit 5
            ) a
        ),
        'urgent_tasks', (
            select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
            from (
                select id, title, priority, status, due_date
                from public.tasks
                where project_id = p.id
                  and status in ('todo','in_progress','blocked')
                  and (priority in ('high','urgent') or due_date <= current_date + interval '3 days')
                order by
                    case priority when 'urgent' then 1 when 'high' then 2 else 3 end,
                    due_date nulls last
                limit 5
            ) t
        )
    ) into v_result
    from public.projects p
    where p.id = p_project_id;

    return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- get_org_dashboard — full snapshot for the home page
-- ---------------------------------------------------------------------
create or replace function public.get_org_dashboard(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'projects', (
            select coalesce(jsonb_agg(public.get_project_status(p.id) order by p.updated_at desc), '[]'::jsonb)
            from public.projects p
            where p.org_id = p_org_id and p.archived_at is null
        ),
        'today_tasks', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id,
                'title', t.title,
                'project_name', pr.name,
                'project_color', pr.color,
                'priority', t.priority,
                'status', t.status,
                'due_date', t.due_date
            ) order by
                case t.priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
                t.due_date nulls last
            ), '[]'::jsonb)
            from public.tasks t
            left join public.projects pr on pr.id = t.project_id
            where t.org_id = p_org_id
              and t.status in ('todo','in_progress','blocked')
            limit 10
        ),
        'pending_dups', (
            select count(*) from public.duplicate_detections
            where org_id = p_org_id and resolution = 'pending'
        ),
        'parking_lot_count', (
            select count(*) from public.ideas
            where org_id = p_org_id and status = 'parking_lot'
        ),
        'recent_activity', (
            select coalesce(jsonb_agg(row_to_json(a) order by a.created_at desc), '[]'::jsonb)
            from (
                select al.*, p.name as project_name
                from public.activity_log al
                left join public.projects p on p.id = al.project_id
                where al.org_id = p_org_id
                order by al.created_at desc
                limit 20
            ) a
        )
    ) into v_result;

    return v_result;
end;
$$;

-- Grants
grant execute on function public.find_similar_chunks to authenticated;
grant execute on function public.find_similar_ideas to authenticated;
grant execute on function public.get_project_status to authenticated;
grant execute on function public.get_org_dashboard to authenticated;
