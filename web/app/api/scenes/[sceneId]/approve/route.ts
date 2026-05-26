import { approveAsset } from "@/lib/orchestrator";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const body = await req.json().catch(() => ({}));
    const assetId = typeof body.asset_id === "string" ? body.asset_id : "";
    if (!assetId) return badRequest("asset_id is required");

    const scene = await approveAsset(sceneId, assetId);
    return ok({ scene });
  } catch (e) {
    return serverError(e);
  }
}
