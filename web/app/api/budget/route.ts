import { getBudgetState, setCap } from "@/lib/budget";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await getBudgetState());
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cap = Number(body.monthly_cap_usd);
    if (!Number.isFinite(cap) || cap < 0) {
      return badRequest("monthly_cap_usd must be a number >= 0");
    }
    await setCap(cap);
    return ok(await getBudgetState());
  } catch (e) {
    return serverError(e);
  }
}
