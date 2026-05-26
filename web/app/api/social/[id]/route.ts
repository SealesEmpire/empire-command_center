import { deletePost } from "@/lib/social";
import { ok, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deletePost(id);
    return ok({ deleted: true });
  } catch (e) {
    return serverError(e);
  }
}
