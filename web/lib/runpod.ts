import { env } from "./env";
import type { JobStatus } from "./types";

const BASE = "https://api.runpod.ai/v2";

export interface RunpodSubmitResult {
  id: string;
  status: string;
}

export interface RunpodStatusResult {
  id: string;
  status: string; // IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELLED | TIMED_OUT
  output?: Record<string, unknown>;
  error?: string;
  delayTime?: number;
  executionTime?: number;
}

// The shape our worker returns inside `output`.
export interface WorkerOutput {
  status: "completed" | "failed" | "ok";
  output_id?: string;
  video_url?: string;
  url_type?: string;
  object_key?: string;
  size_bytes?: number;
  local_path?: string;
  metadata?: Record<string, unknown>;
  error_code?: string;
  error?: string;
}

function headers() {
  return {
    Authorization: `Bearer ${env.runpodApiKey()}`,
    "Content-Type": "application/json",
  };
}

export async function submitJob(
  input: Record<string, unknown>
): Promise<RunpodSubmitResult> {
  const res = await fetch(`${BASE}/${env.runpodEndpointId()}/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod submit failed (${res.status}): ${text}`);
  }
  return (await res.json()) as RunpodSubmitResult;
}

export async function getJobStatus(
  runpodJobId: string
): Promise<RunpodStatusResult> {
  const res = await fetch(
    `${BASE}/${env.runpodEndpointId()}/status/${runpodJobId}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod status failed (${res.status}): ${text}`);
  }
  return (await res.json()) as RunpodStatusResult;
}

export async function cancelJob(runpodJobId: string): Promise<void> {
  await fetch(`${BASE}/${env.runpodEndpointId()}/cancel/${runpodJobId}`, {
    method: "POST",
    headers: headers(),
  });
}

// Map RunPod's lifecycle status to our internal job_status enum.
export function mapRunpodStatus(rp: string): JobStatus {
  switch (rp) {
    case "IN_QUEUE":
      return "queued";
    case "IN_PROGRESS":
      return "in_progress";
    case "COMPLETED":
      return "completed";
    case "TIMED_OUT":
      return "timed_out";
    case "CANCELLED":
      return "canceled";
    case "FAILED":
    default:
      return "failed";
  }
}

// Worker error codes that are worth an automatic retry.
const RETRYABLE_CODES = new Set([
  "SUBPROCESS_ERROR",
  "NO_OUTPUT",
  "GENERATION_FAILED",
  "TIMEOUT",
]);

export function isRetryable(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return RETRYABLE_CODES.has(errorCode);
}
