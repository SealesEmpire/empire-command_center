import { supabaseAdmin } from "@/lib/supabase";
import { ok, badRequest, notFound, serverError } from "@/lib/http";
import type { Scene, Asset } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return badRequest("name cannot be empty");
      patch.name = name;
    }
    if (typeof body.description === "string") patch.description = body.description;
    if (Object.keys(patch).length === 0) return badRequest("nothing to update");

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("projects")
      .update(patch)
      .eq("id", projectId)
      .select("*")
      .single();
    if (error) throw error;
    return ok({ project: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const db = supabaseAdmin();
    const { error } = await db.from("projects").delete().eq("id", projectId);
    if (error) throw error;
    return ok({ deleted: true });
  } catch (e) {
    return serverError(e);
  }
}

// Returns a project with its scenes, each scene's clip assets, and the latest
// job per scene — everything the dashboard needs in one round trip.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const db = supabaseAdmin();

    const { data: project } = await db
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return notFound("Project not found");

    const { data: scenes } = await db
      .from("scenes")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true })
      .returns<Scene[]>();

    const { data: assets } = await db
      .from("assets")
      .select("*")
      .eq("project_id", projectId)
      .eq("kind", "clip")
      .order("created_at", { ascending: false })
      .returns<Asset[]>();

    const { data: latestJobs } = await db
      .from("jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    // group assets + latest job by scene
    const assetsByScene: Record<string, Asset[]> = {};
    for (const a of assets ?? []) {
      if (!a.scene_id) continue;
      (assetsByScene[a.scene_id] ??= []).push(a);
    }
    const latestJobByScene: Record<string, unknown> = {};
    for (const j of latestJobs ?? []) {
      if (!latestJobByScene[j.scene_id]) latestJobByScene[j.scene_id] = j;
    }

    return ok({
      project,
      scenes: scenes ?? [],
      assetsByScene,
      latestJobByScene,
    });
  } catch (e) {
    return serverError(e);
  }
}
