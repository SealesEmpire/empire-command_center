"use client";

import Link from "next/link";
import { Calendar, AlertCircle, FileText, CheckCircle, Clock } from "lucide-react";
import type { ProjectStatus } from "@/types/database";

const phaseColors: Record<string, string> = {
  idea:           "text-empire-textMuted",
  design:         "text-blue-400",
  in_development: "text-empire-violet",
  pre_launch:     "text-yellow-400",
  launched:       "text-empire-green",
  maintenance:    "text-empire-textMuted",
  archived:       "text-empire-textMuted opacity-50",
};

const healthEmoji: Record<string, string> = {
  on_track:        "🟢",
  needs_attention: "🟡",
  blocked:         "🔴",
  paused:          "⚪",
};

export default function ProjectStatusCard({ status }: { status: ProjectStatus }) {
  const { project, task_counts, document_count, recent_activity, urgent_tasks } = status;
  const totalOpenTasks = task_counts.todo + task_counts.in_progress + task_counts.blocked;

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="block bg-empire-card border border-empire-border rounded-xl p-5 hover:border-empire-neon hover:shadow-neon transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{
              background: `linear-gradient(135deg, ${project.color}33, ${project.color}11)`,
              border: `1px solid ${project.color}55`,
            }}
          >
            {project.icon}
          </div>
          <div>
            <h3 className="font-semibold group-hover:text-empire-neon transition-colors">
              {project.name}
            </h3>
            <div className={`text-xs ${phaseColors[project.phase] ?? "text-empire-textMuted"}`}>
              {project.phase.replace("_", " ")}
            </div>
          </div>
        </div>
        <div className="text-xl">{healthEmoji[project.health] ?? "⚪"}</div>
      </div>

      {project.summary && (
        <p className="text-sm text-empire-textMuted mb-3 line-clamp-2">
          {project.summary}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-empire-textMuted mb-1">
          <span>Progress</span>
          <span>{project.percent_complete}%</span>
        </div>
        <div className="h-1.5 bg-empire-bg rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${project.percent_complete}%`,
              background: project.color,
            }}
          />
        </div>
      </div>

      {/* Next milestone */}
      {project.next_milestone && (
        <div className="flex items-center gap-2 text-xs text-empire-textMuted mb-3">
          <Calendar size={12} />
          <span className="truncate">{project.next_milestone}</span>
          {project.next_milestone_date && (
            <span className="ml-auto">{formatDate(project.next_milestone_date)}</span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-empire-border text-center">
        <Stat
          icon={<Clock size={12} />}
          label="Open"
          value={totalOpenTasks}
          highlight={task_counts.blocked > 0 ? "red" : undefined}
        />
        <Stat
          icon={<CheckCircle size={12} />}
          label="Done"
          value={task_counts.done}
        />
        <Stat
          icon={<FileText size={12} />}
          label="Docs"
          value={document_count}
        />
      </div>

      {/* Urgent task preview */}
      {urgent_tasks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-empire-border">
          <div className="text-xs text-empire-textMuted mb-2 flex items-center gap-1.5">
            <AlertCircle size={12} className="text-yellow-400" />
            Urgent
          </div>
          <div className="text-sm truncate">{urgent_tasks[0].title}</div>
        </div>
      )}
    </Link>
  );
}

function Stat({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: number; highlight?: "red";
}) {
  return (
    <div>
      <div className={`flex items-center justify-center gap-1 text-lg font-semibold ${
        highlight === "red" ? "text-red-400" : "text-empire-textPrimary"
      }`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-empire-textMuted flex items-center justify-center gap-1">
        {icon} {label}
      </div>
    </div>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
