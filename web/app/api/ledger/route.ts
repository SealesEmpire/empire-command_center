import { getSummary, recentEntries, recordCost, recordRevenue } from "@/lib/ledger";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

// GET /api/ledger?project_id=...  → { summary, entries }
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id") ?? undefined;
    const summary = await getSummary(projectId);
    const entries = await recentEntries(20);
    return ok({ summary, entries });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/ledger  { kind: 'revenue'|'cost', amount_usd, description?, project_id?, source? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount_usd);
    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest("amount_usd must be a positive number");
    }
    const kind = body.kind === "cost" ? "cost" : "revenue";
    const input = {
      projectId: typeof body.project_id === "string" ? body.project_id : null,
      source: typeof body.source === "string" ? body.source : kind === "cost" ? "manual" : "sale",
      amountUsd: Number(amount.toFixed(4)),
      description: typeof body.description === "string" ? body.description : undefined,
    };
    if (kind === "cost") await recordCost(input);
    else await recordRevenue(input);
    return ok({ recorded: true }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
