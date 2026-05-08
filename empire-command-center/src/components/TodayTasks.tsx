"use client";

import { CheckSquare, Square, AlertCircle } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import type { TaskPriority, TaskStatus } from "@/types/database";

interface TaskItem {
  id: string;
  title: string;
  project_name: string | null;
  project_color: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
}

const priorityClass: Record<TaskPriority, string> = {
  urgent: "text-red-400",
  high:   "text-yellow-400",
  medium: "text-empire-textMuted",
  low:    "text-empire-textMuted opacity-60",
};

export default function TodayTasks({ initial }: { initial: TaskItem[] }) {
  const [tasks, setTasks] = useState(initial);
  const supabase = createClient();

  const toggleTask = async (id: string, currentStatus: TaskStatus) => {
    const newStatus: TaskStatus = currentStatus === "done" ? "todo" : "done";
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)),
    );
    await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "done" ? new Date().toISOString() : null,
      })
      .eq("id", id);
  };

  return (
    <div className="bg-empire-card border border-empire-border rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CheckSquare size={18} className="text-empire-neon" />
        Today's Tasks
        <span className="ml-auto text-xs text-empire-textMuted font-normal">
          {tasks.filter((t) => t.status !== "done").length} open
        </span>
      </h2>

      {tasks.length === 0 ? (
        <p className="text-sm text-empire-textMuted text-center py-6">
          No tasks. The Drop Zone can extract action items from documents.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-empire-bg transition-colors group"
            >
              <button
                onClick={() => toggleTask(task.id, task.status)}
                className="mt-0.5 flex-shrink-0"
              >
                {task.status === "done" ? (
                  <CheckSquare size={18} className="text-empire-green" />
                ) : (
                  <Square size={18} className="text-empire-textMuted group-hover:text-empire-neon" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${
                  task.status === "done" ? "line-through text-empire-textMuted" : ""
                }`}>
                  {task.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {task.project_name && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: `${task.project_color}22`,
                        color: task.project_color ?? "#9ca3af",
                      }}
                    >
                      {task.project_name}
                    </span>
                  )}
                  {task.priority !== "medium" && (
                    <span className={`flex items-center gap-1 ${priorityClass[task.priority]}`}>
                      {task.priority === "urgent" && <AlertCircle size={10} />}
                      {task.priority}
                    </span>
                  )}
                  {task.status === "blocked" && (
                    <span className="text-red-400">blocked</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
