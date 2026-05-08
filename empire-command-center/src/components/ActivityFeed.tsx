"use client";

import { Activity, FileText, CheckCircle, Lightbulb, GitCommit } from "lucide-react";
import type { ActivityLogEntry } from "@/types/database";

const icons: Record<string, React.ReactNode> = {
  document_added:   <FileText size={14} className="text-empire-neon" />,
  task_created:     <GitCommit size={14} className="text-empire-violet" />,
  task_completed:   <CheckCircle size={14} className="text-empire-green" />,
  decision_logged:  <GitCommit size={14} className="text-yellow-400" />,
  idea_captured:    <Lightbulb size={14} className="text-empire-pink" />,
  kb_updated:       <Activity size={14} className="text-empire-textMuted" />,
};

export default function ActivityFeed({ entries }: { entries: ActivityLogEntry[] }) {
  if (!entries.length) {
    return (
      <div className="bg-empire-card border border-empire-border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Activity size={18} className="text-empire-neon" />
          Recent Activity
        </h2>
        <p className="text-sm text-empire-textMuted text-center py-4">
          Drop something into the Drop Zone to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-empire-card border border-empire-border rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity size={18} className="text-empire-neon" />
        Recent Activity
      </h2>
      <ul className="space-y-3">
        {entries.slice(0, 10).map((entry) => (
          <li key={entry.id} className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 flex-shrink-0">
              {icons[entry.activity_type] ?? <Activity size={14} className="text-empire-textMuted" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-empire-textPrimary">{entry.summary}</div>
              <div className="text-xs text-empire-textMuted">
                {entry.project_name && <span>{entry.project_name} · </span>}
                {timeAgo(entry.created_at)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60)    return `${seconds}s ago`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
