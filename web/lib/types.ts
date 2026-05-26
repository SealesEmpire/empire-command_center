export type ProjectStatus =
  | "draft"
  | "generating"
  | "assembling"
  | "completed"
  | "failed";

export type SceneStatus =
  | "pending"
  | "queued"
  | "generating"
  | "generated"
  | "approved"
  | "failed";

export type JobStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "timed_out"
  | "canceled";

export type AssetKind = "clip" | "final" | "image";

export type LedgerKind = "cost" | "revenue";

export const ALLOWED_SIZES = [
  "1280*704",
  "704*1280",
  "960*960",
  "832*480",
  "480*832",
] as const;

export const ALLOWED_TASKS = ["ti2v-5B", "t2v-A14B", "i2v-A14B"] as const;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  final_object_key: string | null;
  final_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  order_index: number;
  title: string | null;
  prompt: string;
  negative_prompt: string;
  size: string;
  sample_steps: number;
  seed: number | null;
  task: string;
  status: SceneStatus;
  approved_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  project_id: string;
  scene_id: string;
  runpod_job_id: string | null;
  worker_type: string;
  status: JobStatus;
  attempt: number;
  params: Record<string, unknown>;
  runpod_output: Record<string, unknown> | null;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Asset {
  id: string;
  project_id: string;
  scene_id: string | null;
  job_id: string | null;
  kind: AssetKind;
  media_type: string;
  object_key: string;
  url: string | null;
  url_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  project_id: string | null;
  kind: LedgerKind;
  source: string;
  amount_usd: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LedgerSummary {
  cost: number;
  revenue: number;
  net: number;
}

export type SocialStatus = "draft" | "scheduled" | "posted";

export interface SocialPost {
  id: string;
  project_id: string | null;
  platform: string;
  content: string;
  hashtags: string[];
  status: SocialStatus;
  scheduled_for: string | null;
  created_at: string;
}
