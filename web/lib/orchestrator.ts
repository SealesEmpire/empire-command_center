import { supabaseAdmin } from "./supabase";
import {
  submitJob,
  getJobStatus,
  cancelJob,
  mapRunpodStatus,
  isRetryable,
  type WorkerOutput,
} from "./runpod";
import { freshSignedUrl } from "./storage";
import { env } from "./env";
import type { Job, Scene, Asset } from "./types";

// Build the worker input payload from a scene + attempt seed.
function buildInput(scene: Scene, seed: number | null) {
  const input: Record<string, unknown> = {
    prompt: scene.prompt,
    negative_prompt: scene.negative_prompt,
    task: scene.task,
    size: scene.size,
    sample_steps: scene.sample_steps,
    project_id: scene.project_id,
    scene_id: scene.id,
  };
  if (seed !== null && seed !== undefined) input.seed = seed;
  return input;
}

/**
 * Kick off a new generation attempt for a scene. Creates a job row, submits to
 * RunPod, and moves the scene into the `generating` state.
 */
export async function startGeneration(sceneId: string): Promise<Job> {
  const db = supabaseAdmin();

  const { data: scene, error: sceneErr } = await db
    .from("scenes")
    .select("*")
    .eq("id", sceneId)
    .single<Scene>();
  if (sceneErr || !scene) throw new Error(`Scene not found: ${sceneId}`);

  // Attempt number = existing job count + 1
  const { count } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("scene_id", sceneId);
  const attempt = (count ?? 0) + 1;

  const input = buildInput(scene, scene.seed);

  // Create job row first so we never lose track of a submitted RunPod job.
  const { data: job, error: jobErr } = await db
    .from("jobs")
    .insert({
      project_id: scene.project_id,
      scene_id: scene.id,
      status: "queued",
      attempt,
      params: input,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single<Job>();
  if (jobErr || !job) throw new Error(`Failed to create job: ${jobErr?.message}`);

  // Submit to RunPod. A failure here means no GPU job was created yet, so it is
  // safe to mark the job failed.
  let submitted;
  try {
    submitted = await submitJob(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("jobs")
      .update({
        status: "failed",
        error_code: "SUBMIT_FAILED",
        error: msg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await db.from("scenes").update({ status: "failed" }).eq("id", scene.id);
    throw new Error(`RunPod submit failed: ${msg}`);
  }

  // The GPU job is now live. Persist its id on its own statement: if we cannot
  // record it, the job would run to completion untracked and burn credits with
  // no way to reconcile, so cancel it and fail loudly rather than orphan it.
  const { error: persistErr } = await db
    .from("jobs")
    .update({
      runpod_job_id: submitted.id,
      status: mapRunpodStatus(submitted.status),
    })
    .eq("id", job.id);
  if (persistErr) {
    await cancelJob(submitted.id).catch(() => {});
    await db
      .from("jobs")
      .update({
        status: "failed",
        error_code: "PERSIST_FAILED",
        error: `Submitted RunPod job ${submitted.id} but could not record its id; the job was canceled. ${persistErr.message}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await db.from("scenes").update({ status: "failed" }).eq("id", scene.id);
    throw new Error(`Failed to persist RunPod job id: ${persistErr.message}`);
  }

  await db.from("scenes").update({ status: "generating" }).eq("id", scene.id);
  await db
    .from("projects")
    .update({ status: "generating" })
    .eq("id", scene.project_id)
    .in("status", ["draft"]);

  const { data: refreshed } = await db
    .from("jobs")
    .select("*")
    .eq("id", job.id)
    .single<Job>();
  return refreshed ?? job;
}

export interface SyncResult {
  job: Job;
  asset?: Asset;
  retriedJob?: Job;
}

/**
 * Pull the latest status for a job from RunPod and reconcile our DB:
 *  - COMPLETED → persist the clip as an asset, mark scene `generated`
 *  - FAILED/TIMED_OUT → record error; auto-retry if retryable + under cap,
 *    otherwise mark scene `failed`
 * Idempotent: terminal jobs are returned as-is without re-hitting RunPod.
 */
export async function syncJob(jobId: string): Promise<SyncResult> {
  const db = supabaseAdmin();

  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single<Job>();
  if (error || !job) throw new Error(`Job not found: ${jobId}`);

  const terminal = ["completed", "failed", "timed_out", "canceled"];
  if (terminal.includes(job.status)) {
    // Already reconciled. Return the latest asset if completed.
    if (job.status === "completed") {
      const { data: asset } = await db
        .from("assets")
        .select("*")
        .eq("job_id", job.id)
        .maybeSingle<Asset>();
      return { job, asset: asset ?? undefined };
    }
    return { job };
  }

  if (!job.runpod_job_id) {
    // Allow a brief window for an in-flight submission (startGeneration runs
    // insert -> submit -> persist-id within one request). Past that, a missing
    // id means submission never completed; fail the job instead of polling it
    // forever so the operator can retry.
    const startedMs = job.started_at ? Date.parse(job.started_at) : Date.now();
    if (Date.now() - startedMs < 60_000) {
      return { job };
    }
    await db
      .from("jobs")
      .update({
        status: "failed",
        error_code: "NO_RUNPOD_ID",
        error: "Job has no RunPod id; submission did not complete.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await db.from("scenes").update({ status: "failed" }).eq("id", job.scene_id);
    return { job: { ...job, status: "failed" } };
  }

  const rp = await getJobStatus(job.runpod_job_id);
  const mapped = mapRunpodStatus(rp.status);
  const output = (rp.output ?? undefined) as WorkerOutput | undefined;

  // Still running.
  if (mapped === "queued" || mapped === "in_progress") {
    if (job.status !== mapped) {
      await db.from("jobs").update({ status: mapped }).eq("id", job.id);
    }
    return { job: { ...job, status: mapped } };
  }

  // RunPod says COMPLETED, but our worker reports success/failure in `output`.
  const workerFailed =
    mapped === "completed" && output?.status === "failed";

  if (mapped === "completed" && !workerFailed && output) {
    return finalizeSuccess(job, output);
  }

  // Failure path (RunPod failure, timeout, or worker-level failure).
  const errorCode =
    output?.error_code ?? (mapped === "timed_out" ? "TIMEOUT" : "GENERATION_FAILED");
  const errorMsg = output?.error ?? rp.error ?? "Generation failed.";
  return finalizeFailure(job, mapped, errorCode, errorMsg, rp.output ?? null);
}

async function finalizeSuccess(
  job: Job,
  output: WorkerOutput
): Promise<SyncResult> {
  const db = supabaseAdmin();
  const objectKey = output.object_key;

  await db
    .from("jobs")
    .update({
      status: "completed",
      runpod_output: output as unknown as Record<string, unknown>,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (!objectKey) {
    // Worker completed but storage wasn't configured. Record the failure so the
    // operator fixes infra rather than silently producing un-assemblable clips.
    await db.from("scenes").update({ status: "failed" }).eq("id", job.scene_id);
    return {
      job: { ...job, status: "completed" },
    };
  }

  // Re-sign so the dashboard always gets a fresh URL.
  const url = await freshSignedUrl(objectKey);

  const { data: asset } = await db
    .from("assets")
    .insert({
      project_id: job.project_id,
      scene_id: job.scene_id,
      job_id: job.id,
      kind: "clip",
      object_key: objectKey,
      url,
      url_type: output.url_type ?? "signed",
      size_bytes: output.size_bytes ?? null,
      metadata: output.metadata ?? {},
    })
    .select("*")
    .single<Asset>();

  await db.from("scenes").update({ status: "generated" }).eq("id", job.scene_id);

  return { job: { ...job, status: "completed" }, asset: asset ?? undefined };
}

async function finalizeFailure(
  job: Job,
  mapped: Job["status"],
  errorCode: string,
  errorMsg: string,
  rawOutput: unknown
): Promise<SyncResult> {
  const db = supabaseAdmin();

  await db
    .from("jobs")
    .update({
      status: mapped,
      error_code: errorCode,
      error: errorMsg,
      runpod_output: (rawOutput as Record<string, unknown>) ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  // Auto-retry if the error is transient and we're under the attempt cap.
  if (isRetryable(errorCode) && job.attempt < env.maxGenerationAttempts()) {
    const retriedJob = await startGeneration(job.scene_id);
    return { job: { ...job, status: mapped }, retriedJob };
  }

  await db.from("scenes").update({ status: "failed" }).eq("id", job.scene_id);
  return { job: { ...job, status: mapped } };
}

/**
 * Approve a specific clip asset for a scene. Sets it as the scene's chosen clip
 * and marks the scene `approved`.
 */
export async function approveAsset(
  sceneId: string,
  assetId: string
): Promise<Scene> {
  const db = supabaseAdmin();

  const { data: asset } = await db
    .from("assets")
    .select("id, scene_id")
    .eq("id", assetId)
    .single<{ id: string; scene_id: string }>();
  if (!asset || asset.scene_id !== sceneId) {
    throw new Error("Asset does not belong to this scene.");
  }

  const { data: scene, error } = await db
    .from("scenes")
    .update({ approved_asset_id: assetId, status: "approved" })
    .eq("id", sceneId)
    .select("*")
    .single<Scene>();
  if (error || !scene) throw new Error(`Failed to approve: ${error?.message}`);
  return scene;
}
