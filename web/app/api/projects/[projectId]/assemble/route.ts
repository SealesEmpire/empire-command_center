import { assembleProject } from "@/lib/assembleProject";
import { ok, badRequest, notFound, serverError } from "@/lib/http";

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
    const result = await assembleProject(projectId);
    return ok({ final: result.final, url: result.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Project not found") return notFound(msg);
    if (
      msg.includes("no scenes") ||
      msg.includes("must have an approved")
    ) {
      return badRequest(msg);
    }
    return serverError(e);
  }
}
