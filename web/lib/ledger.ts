import { supabaseAdmin } from "./supabase";
import type { LedgerEntry, LedgerSummary } from "./types";

interface RecordInput {
  projectId?: string | null;
  source: string;
  amountUsd: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

async function record(kind: "cost" | "revenue", input: RecordInput): Promise<void> {
  // Best-effort: a ledger write must never break the action it's measuring.
  try {
    await supabaseAdmin()
      .from("ledger")
      .insert({
        project_id: input.projectId ?? null,
        kind,
        source: input.source,
        amount_usd: Number.isFinite(input.amountUsd) ? input.amountUsd : 0,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
      });
  } catch {
    /* swallow — ledger is observability, not a hard dependency */
  }
}

export const recordCost = (input: RecordInput) => record("cost", input);
export const recordRevenue = (input: RecordInput) => record("revenue", input);

export async function getSummary(projectId?: string): Promise<LedgerSummary> {
  let q = supabaseAdmin().from("ledger").select("kind, amount_usd");
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q.returns<{ kind: string; amount_usd: number }[]>();
  let cost = 0;
  let revenue = 0;
  for (const row of data ?? []) {
    const amt = Number(row.amount_usd) || 0;
    if (row.kind === "cost") cost += amt;
    else if (row.kind === "revenue") revenue += amt;
  }
  return { cost, revenue, net: revenue - cost };
}

export async function recentEntries(limit = 20): Promise<LedgerEntry[]> {
  const { data } = await supabaseAdmin()
    .from("ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<LedgerEntry[]>();
  return data ?? [];
}
