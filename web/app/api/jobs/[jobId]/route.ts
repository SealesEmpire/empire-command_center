import { syncJob } from "@/lib/orchestrator";
import { ok, serverError } from "@/lib/http";

export const runtime = "nodejs";

// Poll endpoint: reconciles the job against RunPod and returns the current
// state (plus the produced asset / any auto-retried job). The dashboard polls
// this while a scene is generating.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const result = await syncJob(jobId);
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}
