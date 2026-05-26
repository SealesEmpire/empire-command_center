import { startGeneration } from "@/lib/orchestrator";
import { ok, serverError } from "@/lib/http";

export const runtime = "nodejs";

// Kick off (or re-run) a generation attempt for a scene.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const job = await startGeneration(sceneId);
    return ok({ job }, { status: 202 });
  } catch (e) {
    return serverError(e);
  }
}
