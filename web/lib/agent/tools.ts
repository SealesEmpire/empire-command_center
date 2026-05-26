import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { startGeneration, syncJob, approveAsset } from "@/lib/orchestrator";
import { assembleProject } from "@/lib/assembleProject";
import { ALLOWED_SIZES, ALLOWED_TASKS } from "@/lib/types";
import type { Scene, Job, Asset } from "@/lib/types";

// Tool surface the manager bot can call. Each maps 1:1 to an orchestrator
// action so the model drives the video pipeline the same way the dashboard does.
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description:
      "List all video projects with their id, name, status, and creation date. Use this to find a project before acting on it.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_project",
    description: "Create a new video project. Returns the new project id.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_project",
    description:
      "Get full detail for one project: its scenes (in order, with prompt/status/approved clip), how many takes each scene has, and the latest job per scene. Use before generating, approving, or assembling.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_scene",
    description:
      "Add a scene (one shot) to a project. The prompt describes the video to generate. Returns the new scene id.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        prompt: { type: "string", description: "Describe the shot to generate" },
        negative_prompt: { type: "string" },
        title: { type: "string" },
        size: { type: "string", enum: ALLOWED_SIZES as unknown as string[] },
        task: { type: "string", enum: ALLOWED_TASKS as unknown as string[] },
        sample_steps: { type: "integer" },
        seed: { type: "integer" },
      },
      required: ["project_id", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_scene",
    description:
      "Start a generation job for a scene on the GPU worker. Returns immediately with a job id — generation runs asynchronously (minutes). Use check_jobs later to see results.",
    input_schema: {
      type: "object",
      properties: { scene_id: { type: "string" } },
      required: ["scene_id"],
      additionalProperties: false,
    },
  },
  {
    name: "check_jobs",
    description:
      "Reconcile all in-flight generation jobs for a project against the GPU worker. Returns each job's current status and, for completed ones, the resulting clip (asset id + url). Call this to poll progress.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "approve_scene",
    description:
      "Approve a specific generated clip (asset) as the chosen take for a scene. A scene must have an approved clip before the project can be assembled.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        asset_id: { type: "string" },
      },
      required: ["scene_id", "asset_id"],
      additionalProperties: false,
    },
  },
  {
    name: "assemble_project",
    description:
      "Stitch every scene's approved clip (in order) into the final video. Fails if any scene lacks an approved clip. Returns the final video url. This is the last step.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
];

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// Execute a tool call and return a JSON-serializable result for the tool_result.
export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const db = supabaseAdmin();

  switch (name) {
    case "list_projects": {
      const { data } = await db
        .from("projects")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });
      return { projects: data ?? [] };
    }

    case "create_project": {
      const projName = String(input.name ?? "").trim();
      if (!projName) throw new Error("name is required");
      const { data, error } = await db
        .from("projects")
        .insert({
          name: projName,
          description:
            typeof input.description === "string" ? input.description : null,
        })
        .select("id, name, status")
        .single();
      if (error) throw error;
      return { project: data };
    }

    case "get_project": {
      const projectId = String(input.project_id ?? "");
      const { data: project } = await db
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (!project) throw new Error("Project not found");

      const { data: scenes } = await db
        .from("scenes")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true })
        .returns<Scene[]>();

      const { data: assets } = await db
        .from("assets")
        .select("id, scene_id, url, created_at")
        .eq("project_id", projectId)
        .eq("kind", "clip")
        .returns<Pick<Asset, "id" | "scene_id" | "url" | "created_at">[]>();

      const takesByScene: Record<string, { id: string; url: string | null }[]> = {};
      for (const a of assets ?? []) {
        if (!a.scene_id) continue;
        (takesByScene[a.scene_id] ??= []).push({ id: a.id, url: a.url });
      }

      return {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          final_video_url: project.final_video_url,
        },
        scenes: (scenes ?? []).map((s) => ({
          id: s.id,
          order_index: s.order_index,
          title: s.title,
          prompt: s.prompt,
          status: s.status,
          approved_asset_id: s.approved_asset_id,
          takes: takesByScene[s.id] ?? [],
        })),
      };
    }

    case "create_scene": {
      const projectId = String(input.project_id ?? "");
      const prompt = String(input.prompt ?? "").trim();
      if (!projectId) throw new Error("project_id is required");
      if (!prompt) throw new Error("prompt is required");

      const { data: maxRow } = await db
        .from("scenes")
        .select("order_index")
        .eq("project_id", projectId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle<{ order_index: number }>();
      const orderIndex = (maxRow?.order_index ?? -1) + 1;

      const size = ALLOWED_SIZES.includes(input.size as never)
        ? (input.size as string)
        : "1280*704";
      const task = ALLOWED_TASKS.includes(input.task as never)
        ? (input.task as string)
        : "ti2v-5B";

      const { data, error } = await db
        .from("scenes")
        .insert({
          project_id: projectId,
          order_index: orderIndex,
          title: typeof input.title === "string" ? input.title : null,
          prompt,
          negative_prompt:
            typeof input.negative_prompt === "string" ? input.negative_prompt : "",
          size,
          task,
          sample_steps: clampInt(input.sample_steps, 30, 1, 100),
          seed:
            input.seed === undefined || input.seed === null
              ? null
              : clampInt(input.seed, 0, 0, 2147483647),
        })
        .select("id, prompt, order_index")
        .single();
      if (error) throw error;
      return { scene: data };
    }

    case "generate_scene": {
      const sceneId = String(input.scene_id ?? "");
      const job = await startGeneration(sceneId);
      return {
        job: { id: job.id, status: job.status, attempt: job.attempt },
        note: "Generation started; runs asynchronously. Use check_jobs to poll.",
      };
    }

    case "check_jobs": {
      const projectId = String(input.project_id ?? "");
      const { data: jobs } = await db
        .from("jobs")
        .select("id, scene_id, status")
        .eq("project_id", projectId)
        .in("status", ["queued", "in_progress"])
        .returns<Pick<Job, "id" | "scene_id" | "status">[]>();

      const results = [];
      for (const j of jobs ?? []) {
        const r = await syncJob(j.id);
        results.push({
          job_id: r.job.id,
          scene_id: r.job.scene_id,
          status: r.job.status,
          error_code: r.job.error_code,
          asset: r.asset ? { id: r.asset.id, url: r.asset.url } : undefined,
          retried_job_id: r.retriedJob?.id,
        });
      }
      return {
        synced: results,
        note:
          results.length === 0
            ? "No in-flight jobs. Generation may not have started, or all jobs are already terminal — use get_project to see clips."
            : undefined,
      };
    }

    case "approve_scene": {
      const scene = await approveAsset(
        String(input.scene_id ?? ""),
        String(input.asset_id ?? "")
      );
      return { scene: { id: scene.id, status: scene.status } };
    }

    case "assemble_project": {
      const result = await assembleProject(String(input.project_id ?? ""));
      return { final_video_url: result.url };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
