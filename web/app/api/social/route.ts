import { createPost, listPosts } from "@/lib/social";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id") ?? undefined;
    return ok({ posts: await listPosts(projectId) });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = typeof body.platform === "string" ? body.platform.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!platform) return badRequest("platform is required");
    if (!content) return badRequest("content is required");
    const post = await createPost({
      projectId: typeof body.project_id === "string" ? body.project_id : null,
      platform,
      content,
      hashtags: Array.isArray(body.hashtags)
        ? body.hashtags.filter((h: unknown) => typeof h === "string")
        : [],
      scheduledFor: typeof body.scheduled_for === "string" ? body.scheduled_for : null,
    });
    return ok({ post }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
