import { getManagerInstructions, setManagerInstructions } from "@/lib/managerSettings";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const instructions = await getManagerInstructions();
    return ok({ instructions });
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.instructions !== "string") {
      return badRequest("instructions must be a string");
    }
    await setManagerInstructions(body.instructions);
    return ok({ instructions: body.instructions });
  } catch (e) {
    return serverError(e);
  }
}
