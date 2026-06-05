-- Empire Command Center — integrity guards
-- Adds value constraints and a concurrency guard on top of 0001_init.sql.

-- ── Value constraints ──────────────────────────────────────────────────────
-- The status columns are already enums (0001), so invalid statuses are
-- impossible. These CHECKs cover the remaining numeric/text fields that the
-- application validates but the schema previously did not.
do $$ begin
  alter table scenes
    add constraint scenes_sample_steps_positive check (sample_steps > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table scenes
    add constraint scenes_order_index_nonneg check (order_index >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table jobs
    add constraint jobs_attempt_positive check (attempt > 0);
exception when duplicate_object then null; end $$;

-- ── Concurrency guard ───────────────────────────────────────────────────────
-- Enforce at most one in-flight job per scene. This makes the "a generation is
-- already in progress" guard in orchestrator.startGeneration atomic: two
-- concurrent submit requests for the same scene can no longer both create a
-- queued job and race two GPU runs (duplicate spend).
create unique index if not exists uniq_jobs_active_per_scene
  on jobs (scene_id)
  where status in ('queued', 'in_progress');
