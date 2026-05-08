// =====================================================================
// Database types — kept in sync with the SQL migrations
// =====================================================================

export type ProjectPhase =
  | "idea" | "design" | "in_development" | "pre_launch"
  | "launched" | "maintenance" | "archived";

export type ProjectHealth = "on_track" | "needs_attention" | "blocked" | "paused";
export type TaskStatus    = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority  = "low" | "medium" | "high" | "urgent";

export type DocumentType =
  | "spec" | "legal" | "code" | "screenshot" | "flow_chart"
  | "pitch" | "financial" | "meeting_notes" | "idea" | "reference" | "other";

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  phase: ProjectPhase;
  health: ProjectHealth;
  color: string;
  icon: string;
  next_milestone: string | null;
  next_milestone_date: string | null;
  percent_complete: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: "manual" | "extracted" | "inferred";
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  assigned_to: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  document_type: DocumentType;
  storage_path: string | null;
  summary: string | null;
  tags: string[];
  source: string | null;
  created_at: string;
}

export interface Idea {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: "parking_lot" | "researching" | "promoted" | "declined" | "merged";
  related_project_id: string | null;
  tags: string[];
  captured_at: string;
}

export interface ActivityLogEntry {
  id: string;
  org_id: string;
  project_id: string | null;
  user_id: string | null;
  activity_type: string;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
  project_name?: string;
}

export interface ProjectStatus {
  project: Project;
  task_counts: {
    todo: number;
    in_progress: number;
    blocked: number;
    done: number;
  };
  document_count: number;
  decision_count: number;
  last_activity_at: string | null;
  recent_activity: ActivityLogEntry[];
  urgent_tasks: Task[];
}

export interface DashboardData {
  projects: ProjectStatus[];
  today_tasks: Array<{
    id: string;
    title: string;
    project_name: string | null;
    project_color: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    due_date: string | null;
  }>;
  pending_dups: number;
  parking_lot_count: number;
  recent_activity: ActivityLogEntry[];
}
