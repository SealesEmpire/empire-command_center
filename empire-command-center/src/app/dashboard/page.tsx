import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import NavBar from "@/components/NavBar";
import DropZone from "@/components/DropZone";
import ProjectStatusCard from "@/components/ProjectStatusCard";
import TodayTasks from "@/components/TodayTasks";
import ActivityFeed from "@/components/ActivityFeed";
import { AlertTriangle, Lightbulb } from "lucide-react";
import type { DashboardData } from "@/types/database";

export default async function DashboardPage() {
  const supabase = createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's first/active org
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/onboarding");

  const orgId   = membership.org_id;
  const orgName = (membership.organizations as { name: string } | null)?.name ?? "Empire";

  // Fetch dashboard data via RPC
  const { data: dashboard } = await supabase
    .rpc("get_org_dashboard", { p_org_id: orgId })
    .returns<DashboardData>();

  // Get project list for DropZone selector
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, color")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("name");

  const data: DashboardData = dashboard ?? {
    projects: [],
    today_tasks: [],
    pending_dups: 0,
    parking_lot_count: 0,
    recent_activity: [],
  };

  return (
    <div>
      <NavBar activeOrgName={orgName} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Top row — alert banners */}
        {(data.pending_dups > 0 || data.parking_lot_count > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.pending_dups > 0 && (
              <a
                href="/documents?filter=duplicates"
                className="flex items-center gap-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
              >
                <AlertTriangle size={18} className="text-yellow-500 flex-shrink-0" />
                <div className="text-sm">
                  <strong>{data.pending_dups}</strong> possible duplicate{data.pending_dups > 1 ? "s" : ""} need review
                </div>
              </a>
            )}
            {data.parking_lot_count > 0 && (
              <a
                href="/ideas"
                className="flex items-center gap-3 p-3 rounded-lg border border-empire-pink/30 bg-empire-pink/5 hover:bg-empire-pink/10 transition-colors"
              >
                <Lightbulb size={18} className="text-empire-pink flex-shrink-0" />
                <div className="text-sm">
                  <strong>{data.parking_lot_count}</strong> idea{data.parking_lot_count > 1 ? "s" : ""} in the parking lot
                </div>
              </a>
            )}
          </div>
        )}

        {/* Drop Zone — always front and center */}
        <DropZone orgId={orgId} projects={projects ?? []} />

        {/* Project grid */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Projects</h2>
          {data.projects.length === 0 ? (
            <div className="bg-empire-card border border-empire-border rounded-xl p-8 text-center">
              <p className="text-empire-textMuted mb-4">No projects yet.</p>
              <a
                href="/projects/new"
                className="inline-block bg-empire-neon text-empire-bg font-semibold px-4 py-2 rounded-lg hover:shadow-neonStrong transition-shadow"
              >
                Create First Project
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.projects.map((p) => (
                <ProjectStatusCard key={p.project.id} status={p} />
              ))}
            </div>
          )}
        </section>

        {/* Bottom row — tasks + activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TodayTasks initial={data.today_tasks} />
          <ActivityFeed entries={data.recent_activity} />
        </div>
      </main>
    </div>
  );
}
