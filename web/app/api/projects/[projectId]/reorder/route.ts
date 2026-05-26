import { supabaseAdmin } from "@/lib/supabase";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

// Persist a new scene order. Accepts the full list of scene IDs in the desired
// order and rewrites order_index accordingly.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body.scene_ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      return badRequest("scene_ids must be an array of strings");
    }

    const db = supabaseAdmin();
    await Promise.all(
      (ids as string[]).map((id, i) =>
        db
          .from("scenes")
          .update({ order_index: i })
          .eq("id", id)
          .eq("project_id", projectId)
      )
    );
    return ok({ ordered: ids.length });
  } catch (e) {
    return serverError(e);
  }
}
