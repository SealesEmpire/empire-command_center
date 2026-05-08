// =====================================================================
// daily-report — generate the morning status report
// ---------------------------------------------------------------------
// Triggered:
//   - Manually from UI ("Generate today's report")
//   - Or by pg_cron each morning at 6 AM org-local time
// ---------------------------------------------------------------------
// Output: a markdown report saved to daily_reports table
// =====================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, errorResponse } from "../_shared/cors.ts";
import { askClaude } from "../_shared/ai.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const REPORT_PROMPT = `You are the morning briefing agent for Seale's Empire LLC.
Generate a concise, scannable status report in Markdown.

Format:

# Empire Status — [date]

## At a Glance
- Active projects: N
- Open tasks: N (X urgent, Y high)
- Yesterday's completions: N
- Pending duplicate reviews: N

## Project Status

### [Project Name] — [emoji status]
- Phase: ...
- Next milestone: ...
- Recent activity: ...
- Blockers: ... (or "None")

(repeat for each project)

## Today's Top 3
1. [Project] Highest-priority task
2. ...
3. ...

## Notes
Any cross-project observations, nudges, or items needing attention.

Keep it under 400 words. Use status emojis: 🟢 on track, 🟡 needs attention, 🔴 blocked.
Be direct, no fluff.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return errorResponse(405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse(401, "unauthorized");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return errorResponse(401, "invalid_token");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: { org_id: string };
  try { body = await req.json(); }
  catch { return errorResponse(400, "invalid_json"); }

  if (!body.org_id) return errorResponse(400, "missing_org_id");

  // Verify membership
  const { data: membership } = await userClient
    .from("org_members")
    .select("role")
    .eq("org_id", body.org_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return errorResponse(403, "no_access");

  // Pull dashboard snapshot
  const { data: dashboard, error: dashErr } = await supabase.rpc("get_org_dashboard", {
    p_org_id: body.org_id,
  });
  if (dashErr) return errorResponse(500, "dashboard_failed", dashErr.message);

  const today = new Date().toISOString().slice(0, 10);

  // Generate report
  let reportText: string;
  try {
    reportText = await askClaude(
      REPORT_PROMPT,
      [{
        role: "user",
        content: `Today's date: ${today}\n\nDashboard data:\n${JSON.stringify(dashboard, null, 2)}`,
      }],
      2048,
    );
  } catch (err) {
    return errorResponse(500, "report_generation_failed", (err as Error).message);
  }

  // Save report (upsert by date)
  const { data: report, error: rErr } = await supabase
    .from("daily_reports")
    .upsert({
      org_id: body.org_id,
      report_date: today,
      content: reportText,
      metrics: {
        active_projects: (dashboard?.projects ?? []).length,
        open_tasks: (dashboard?.today_tasks ?? []).length,
        pending_dups: dashboard?.pending_dups ?? 0,
      },
    }, { onConflict: "org_id,report_date" })
    .select()
    .single();

  if (rErr) return errorResponse(500, "report_save_failed", rErr.message);

  return json(200, {
    status: "ok",
    report_id: report.id,
    content: reportText,
    date: today,
  });
});
