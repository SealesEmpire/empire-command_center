import { supabaseAdmin } from "@/lib/supabase";
import { ok, serverError } from "@/lib/http";
import { ALLOWED_SIZES, ALLOWED_TASKS } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.prompt === "string") patch.prompt = body.prompt.trim();
    if (typeof body.negative_prompt === "string")
      patch.negative_prompt = body.negative_prompt;
    if (typeof body.size === "string" && ALLOWED_SIZES.includes(body.size as never))
      patch.size = body.size;
    if (typeof body.task === "string" && ALLOWED_TASKS.includes(body.task as never))
      patch.task = body.task;
    if (body.sample_steps !== undefined)
      patch.sample_steps = Math.min(100, Math.max(1, Number(body.sample_steps) || 30));
    if (body.seed !== undefined)
      patch.seed =
        body.seed === null || body.seed === ""
          ? null
          : Math.max(0, Math.min(2147483647, Number(body.seed) || 0));

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("scenes")
      .update(patch)
      .eq("id", sceneId)
      .select("*")
      .single();
    if (error) throw error;
    return ok({ scene: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const db = supabaseAdmin();
    const { error } = await db.from("scenes").delete().eq("id", sceneId);
    if (error) throw error;
    return ok({ deleted: true });
  } catch (e) {
    return serverError(e);
  }
}
