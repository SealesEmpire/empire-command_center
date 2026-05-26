import { supabaseAdmin } from "./supabase";
import { assembleClips } from "./assembler";
import { uploadObject } from "./storage";
import type { Scene, Asset } from "./types";

export interface AssembleResult {
  final: Asset | null;
  url: string;
}

// Collect a project's approved clips in scene order, concatenate them into a
// final MP4, upload it, and link it on the project. Throws on any precondition
// failure (no scenes, unapproved scenes, missing assets) or assembly error.
export async function assembleProject(
  projectId: string,
  audioObjectKey?: string
): Promise<AssembleResult> {
  const db = supabaseAdmin();

  const { data: project } = await db
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("Project not found");

  const { data: scenes } = await db
    .from("scenes")
    .select("*")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true })
    .returns<Scene[]>();

  const ordered = scenes ?? [];
  if (ordered.length === 0) throw new Error("Project has no scenes.");

  const unapproved = ordered.filter((s) => !s.approved_asset_id);
  if (unapproved.length > 0) {
    throw new Error(
      `All scenes must have an approved clip. ${unapproved.length} still pending.`
    );
  }

  const approvedIds = ordered.map((s) => s.approved_asset_id as string);
  const { data: assets } = await db
    .from("assets")
    .select("*")
    .in("id", approvedIds)
    .returns<Asset[]>();
  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));
  const objectKeys = approvedIds.map((id) => {
    const a = assetById.get(id);
    if (!a) throw new Error(`Approved asset ${id} not found`);
    return a.object_key;
  });

  await db.from("projects").update({ status: "assembling" }).eq("id", projectId);

  let finalBuffer: Buffer;
  try {
    finalBuffer = await assembleClips(objectKeys, audioObjectKey);
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

  return { final: finalAsset, url: uploaded.url };
}
