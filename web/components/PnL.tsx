import type { LedgerSummary } from "@/lib/types";

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PnL({
  summary,
  compact,
}: {
  summary: LedgerSummary;
  compact?: boolean;
}) {
  const netColor =
    summary.net > 0 ? "var(--accent-2)" : summary.net < 0 ? "var(--danger)" : "var(--muted)";

  if (compact) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        revenue {fmt(summary.revenue)} · cost {fmt(summary.cost)} ·{" "}
        <span style={{ color: netColor, fontWeight: 700 }}>net {fmt(summary.net)}</span>
      </span>
    );
  }

  return (
    <div className="row" style={{ gap: 24 }}>
      <div>
        <div className="muted" style={{ fontSize: 11 }}>
          REVENUE
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-2)" }}>
          {fmt(summary.revenue)}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11 }}>
          COST
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--warn)" }}>
          {fmt(summary.cost)}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11 }}>
          NET
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: netColor }}>
          {fmt(summary.net)}
        </div>
      </div>
    </div>
  );
}
