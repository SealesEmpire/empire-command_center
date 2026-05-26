import { supabaseAdmin } from "./supabase";

export interface BudgetState {
  cap: number; // monthly cap in USD; 0 = unlimited
  monthSpend: number; // recorded cost this calendar month
  remaining: number | null; // null when unlimited
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function getCap(): Promise<number> {
  try {
    const { data } = await supabaseAdmin()
      .from("budget")
      .select("monthly_cap_usd")
      .eq("id", "default")
      .maybeSingle<{ monthly_cap_usd: number }>();
    return Number(data?.monthly_cap_usd ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function setCap(cap: number): Promise<void> {
  const value = Number.isFinite(cap) && cap > 0 ? cap : 0;
  const { error } = await supabaseAdmin()
    .from("budget")
    .upsert({ id: "default", monthly_cap_usd: value });
  if (error) throw error;
}

export async function getMonthSpend(): Promise<number> {
  try {
    const { data } = await supabaseAdmin()
      .from("ledger")
      .select("amount_usd")
      .eq("kind", "cost")
      .gte("created_at", monthStartIso())
      .returns<{ amount_usd: number }[]>();
    return (data ?? []).reduce((s, r) => s + (Number(r.amount_usd) || 0), 0);
  } catch {
    return 0;
  }
}

export async function getBudgetState(): Promise<BudgetState> {
  const [cap, monthSpend] = await Promise.all([getCap(), getMonthSpend()]);
  return {
    cap,
    monthSpend,
    remaining: cap > 0 ? Math.max(0, cap - monthSpend) : null,
  };
}

// Throw BudgetExceededError if this month's recorded spend has reached the cap.
// Call before any paid generation. Best-effort reads mean a transient DB error
// never blocks generation — the guard fails open, not closed.
export async function assertWithinBudget(): Promise<void> {
  const cap = await getCap();
  if (cap <= 0) return; // unlimited
  const spent = await getMonthSpend();
  if (spent >= cap) {
    throw new BudgetExceededError(
      `Monthly budget cap of $${cap.toFixed(2)} reached (spent $${spent.toFixed(
        2
      )} this month). Raise the cap to keep generating.`
    );
  }
}
