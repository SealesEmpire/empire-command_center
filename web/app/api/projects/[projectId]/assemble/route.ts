import { supabaseAdmin } from "@/lib/supabase";
import { assembleClips } from "@/lib/assembler";
import { uploadObject } from "@/lib/storage";
import { ok, badRequest, notFound, serverError } from "@/lib/http";
import type { Scene, Asset } from "@/lib/types";

export const runtime = "nodejs";
// Assembly downloads every approved clip and runs ffmpeg — give it room.
// On Vercel this requires a plan that allows extended function duration; for
// long videos, run the orchestrator on a long-lived Node host instead.
export const maxDuration = 300;

export async function POST(
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

    const ordered = scenes ?? [];
    if (ordered.length === 0) return badRequest("Project has no scenes.");

    const unapproved = ordered.filter((s) => !s.approved_asset_id);
    if (unapproved.length > 0) {
      return badRequest(
        `All scenes must have an approved clip. ${unapproved.length} still pending.`
      );
    }

    // Resolve approved asset object keys in scene order. Scope the lookup to
    // this project so a stale or cross-project approved_asset_id can never pull
    // a foreign clip into the assembly.
    const approvedIds = ordered.map((s) => s.approved_asset_id as string);
    const { data: assets } = await db
      .from("assets")
      .select("*")
      .eq("project_id", projectId)
      .in("id", approvedIds)
      .returns<Asset[]>();
    const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

    // An approved id with no matching asset means the clip was deleted or
    // belongs to another project. Surface a clear, actionable error rather than
    // failing deep inside ffmpeg.
    const missing = ordered.filter(
      (s) => !assetById.has(s.approved_asset_id as string)
    );
    if (missing.length > 0) {
      return badRequest(
        `Approved clip missing for ${missing.length} scene(s) (deleted or not part of this project). Re-approve a clip for those scenes and try again.`
      );
    }
    const objectKeys = approvedIds.map((id) => assetById.get(id)!.object_key);

    await db.from("projects").update({ status: "assembling" }).eq("id", projectId);

    let finalBuffer: Buffer;
    try {
      finalBuffer = await assembleClips(objectKeys);
    } catch (e) {
      await db.from("projects").update({ status: "failed" }).eq("id", projectId);
      throw e;
    }

    const finalKey = `projects/${projectId}/final/${Date.now()}.mp4`;
    const uploaded = await uploadObject(finalKey, finalBuffer, "video/mp4");

    const { data: finalAsset } = await db
      .from("assets")
      .insert({
        project_id: projectId,
        scene_id: null,
        kind: "final",
        object_key: uploaded.objectKey,
        url: uploaded.url,
        url_type: uploaded.urlType,
        size_bytes: uploaded.sizeBytes,
        metadata: { clip_count: objectKeys.length },
      })
      .select("*")
      .single<Asset>();

    await db
      .from("projects")
      .update({
        status: "completed",
        final_object_key: uploaded.objectKey,
        final_video_url: uploaded.url,
      })
      .eq("id", projectId);

    return ok({ final: finalAsset, url: uploaded.url });
  } catch (e) {
    return serverError(e);
  }
}
