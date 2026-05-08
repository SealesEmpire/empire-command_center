// =====================================================================
// extract-tasks — read a document, extract actionable tasks
// ---------------------------------------------------------------------
// Triggered:
//   - On-demand from the UI ("Extract tasks from this doc")
//   - Or from another edge function after ingestion (auto-mode)
// ---------------------------------------------------------------------
// Input:  { document_id }
// Output: { tasks: [...], created_count }
// =====================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, errorResponse } from "../_shared/cors.ts";
import { askClaude, extractJSON } from "../_shared/ai.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const TASK_EXTRACT_PROMPT = `You are a task extraction agent for Seale's Empire LLC.
You read a document and identify any explicit or implicit action items it contains.

Return strict JSON only:

{
  "tasks": [
    {
      "title": string (action verb + object, max 100 chars),
      "description": string (1-2 sentences of context),
      "priority": "low" | "medium" | "high" | "urgent",
      "extracted_from_text": string (the snippet that led to this task),
      "due_hint": string | null (e.g. "before launch", "this week")
    }
  ]
}

Guidelines:
- ONLY extract real action items, not generic recommendations
- Be specific: "Get fintech lawyer to review 15% interest rate" beats "Talk to a lawyer"
- High/urgent priority for compliance, security, financial integrity items
- Skip tasks that are clearly already complete
- If no tasks, return {"tasks": []}

Return ONLY the JSON. No prose, no markdown fences.`;

interface ExtractedTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  extracted_from_text: string;
  due_hint: string | null;
}

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

  let body: { document_id: string };
  try { body = await req.json(); }
  catch { return errorResponse(400, "invalid_json"); }

  if (!body.document_id) return errorResponse(400, "missing_document_id");

  // Fetch the document
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, org_id, project_id, title, extracted_text, document_type")
    .eq("id", body.document_id)
    .single();

  if (docErr || !doc) return errorResponse(404, "document_not_found");

  // Verify user has access to this org
  const { data: membership } = await userClient
    .from("org_members")
    .select("role")
    .eq("org_id", doc.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return errorResponse(403, "no_access");

  // Ask Claude to extract tasks
  let result: { tasks: ExtractedTask[] };
  try {
    const claudeResp = await askClaude(
      TASK_EXTRACT_PROMPT,
      [{
        role: "user",
        content: `Document title: ${doc.title}\nType: ${doc.document_type}\n\n${doc.extracted_text?.slice(0, 8000) ?? ""}`,
      }],
      2048,
    );
    result = extractJSON<{ tasks: ExtractedTask[] }>(claudeResp);
  } catch (err) {
    return errorResponse(500, "extraction_failed", (err as Error).message);
  }

  // Insert tasks
  const insertedTasks: unknown[] = [];
  for (const task of result.tasks ?? []) {
    const { data: t, error: tErr } = await supabase
      .from("tasks")
      .insert({
        org_id: doc.org_id,
        project_id: doc.project_id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        source: "extracted",
        source_document_id: doc.id,
        extracted_from_text: task.extracted_from_text,
        created_by: user.id,
      })
      .select()
      .single();

    if (!tErr && t) {
      insertedTasks.push(t);

      await supabase.from("activity_log").insert({
        org_id: doc.org_id,
        project_id: doc.project_id,
        user_id: user.id,
        activity_type: "task_created",
        summary: `Extracted task "${task.title}" from "${doc.title}"`,
        related_task_id: t.id,
        related_document_id: doc.id,
      });
    }
  }

  return json(200, {
    status: "ok",
    created_count: insertedTasks.length,
    tasks: insertedTasks,
  });
});
