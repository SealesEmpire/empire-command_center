import { supabaseAdmin } from "@/lib/supabase";
import { ok, badRequest, serverError } from "@/lib/http";
import { ALLOWED_SIZES, ALLOWED_TASKS } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const projectId =
      typeof body.project_id === "string" ? body.project_id : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!projectId) return badRequest("project_id is required");
    if (!prompt) return badRequest("prompt is required");
    if (prompt.length > 4000) return badRequest("prompt exceeds 4000 chars");

    const size =
      typeof body.size === "string" && ALLOWED_SIZES.includes(body.size as never)
        ? body.size
        : "1280*704";
    const task =
      typeof body.task === "string" && ALLOWED_TASKS.includes(body.task as never)
        ? body.task
        : "ti2v-5B";
    const sampleSteps = Math.min(
      100,
      Math.max(1, Number(body.sample_steps) || 30)
    );
    const seed =
      body.seed === null || body.seed === undefined || body.seed === ""
        ? null
        : Math.max(0, Math.min(2147483647, Number(body.seed) || 0));

    const db = supabaseAdmin();

    // Append to the end of the project's scene list.
    const { data: maxRow } = await db
      .from("scenes")
      .select("order_index")
      .eq("project_id", projectId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle<{ order_index: number }>();
    const orderIndex = (maxRow?.order_index ?? -1) + 1;

    const { data, error } = await db
      .from("scenes")
      .insert({
        project_id: projectId,
        order_index: orderIndex,
        title: typeof body.title === "string" ? body.title : null,
        prompt,
        negative_prompt:
          typeof body.negative_prompt === "string" ? body.negative_prompt : "",
        size,
        task,
        sample_steps: sampleSteps,
        seed,
      })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ scene: data }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
