// =====================================================================
// ingest — the Drop Zone backend
// ---------------------------------------------------------------------
// Handles three input types:
//   1. text     — pasted content (any length)
//   2. url      — link to fetch and ingest
//   3. file     — multipart upload (handled by /ingest-file separately)
//
// Pipeline:
//   1. Check exact duplicate (SHA-256 hash)
//   2. Extract text content
//   3. Generate embedding
//   4. Find semantic duplicates (cosine similarity)
//   5. Auto-classify: project + document_type + tags
//   6. Insert document, chunk, embedding
//   7. Log activity
//   8. Return result with any duplicate warnings
// =====================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, errorResponse } from "../_shared/cors.ts";
import { askClaude, extractJSON, getEmbedding } from "../_shared/ai.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

interface IngestRequest {
  org_id: string;
  source: "paste" | "url" | "voice";
  title?: string;
  content?: string;          // for paste
  url?: string;              // for url
  hint_project_id?: string;  // optional manual project assignment
  hint_type?: string;        // optional manual type
}

interface ClassificationResult {
  suggested_title: string;
  document_type: string;
  suggested_project_id: string | null;
  suggested_project_name: string | null;
  tags: string[];
  summary: string;
  confidence: number;
}

const CLASSIFY_SYSTEM_PROMPT = `You are an expert content organizer for Seale's Empire LLC, a company building three connected applications:
- FDDY / "Your Assistance" — AI home repair platform with escrow marketplace
- B2C Hub Wallet — financial wallet, lending pool, profit distribution
- The Nexus — multi-sided commerce hub with five user types

You will be given a piece of content (text, document excerpt, or web page). Classify it and return strict JSON only:

{
  "suggested_title": string (concise, descriptive, max 80 chars),
  "document_type": "spec" | "legal" | "code" | "screenshot" | "flow_chart" | "pitch" | "financial" | "meeting_notes" | "idea" | "reference" | "other",
  "suggested_project_id": string | null (use the EXACT id from the projects list),
  "suggested_project_name": string | null,
  "tags": string[] (3-7 short, lowercase, hyphen-separated tags),
  "summary": string (1-3 sentences capturing key information),
  "confidence": number 0-1
}

Return ONLY the JSON object. No prose, no markdown fences.`;

async function fetchUrl(url: string): Promise<{ text: string; title: string }> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "EmpireCommandCenter/1.0" },
  });
  if (!resp.ok) throw new Error(`URL fetch failed: ${resp.status}`);
  const html = await resp.text();
  // Naive HTML → text. Replace with Readability later for production.
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, title: titleMatch?.[1] ?? url };
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function chunkText(text: string, maxChars = 2000): string[] {
  // Split on paragraphs, then assemble into ~maxChars chunks
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + p).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 50);  // skip tiny chunks
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return errorResponse(405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse(401, "unauthorized");

  // User-scoped client for auth check
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return errorResponse(401, "invalid_token");

  // Service-role client for writes
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: IngestRequest;
  try { body = await req.json(); }
  catch { return errorResponse(400, "invalid_json"); }

  const { org_id, source, hint_project_id, hint_type } = body;
  if (!org_id || !source) return errorResponse(400, "missing_required_fields");

  // ---- 1. Get content ----
  let rawText: string;
  let providedTitle = body.title;
  let sourceUrl: string | undefined;

  if (source === "paste") {
    if (!body.content) return errorResponse(400, "missing_content");
    rawText = body.content;
  } else if (source === "url") {
    if (!body.url) return errorResponse(400, "missing_url");
    sourceUrl = body.url;
    const fetched = await fetchUrl(body.url);
    rawText = fetched.text;
    if (!providedTitle) providedTitle = fetched.title;
  } else {
    return errorResponse(400, "unsupported_source");
  }

  // ---- 2. Exact-duplicate check ----
  const contentHash = await sha256Hex(rawText);
  const { data: exactDup } = await supabase
    .from("documents")
    .select("id, title")
    .eq("org_id", org_id)
    .eq("file_hash", contentHash)
    .maybeSingle();

  if (exactDup) {
    return json(200, {
      status: "exact_duplicate",
      message: `Identical content already exists as "${exactDup.title}"`,
      existing_document_id: exactDup.id,
    });
  }

  // ---- 3. Get project list for classifier context ----
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug, description")
    .eq("org_id", org_id)
    .is("archived_at", null);

  // ---- 4. Classify with Claude ----
  const projectListText = (projects ?? [])
    .map((p) => `- ${p.id}: ${p.name} — ${p.description ?? ""}`)
    .join("\n");

  let classification: ClassificationResult;
  try {
    const claudeResp = await askClaude(
      CLASSIFY_SYSTEM_PROMPT,
      [{
        role: "user",
        content: `Available projects:\n${projectListText || "(none yet)"}\n\nContent to classify:\n\n${rawText.slice(0, 6000)}`,
      }],
      1024,
    );
    classification = extractJSON<ClassificationResult>(claudeResp);
  } catch (err) {
    return errorResponse(500, "classification_failed", (err as Error).message);
  }

  // Allow user hints to override classifier
  const finalProjectId = hint_project_id ?? classification.suggested_project_id;
  const finalType = (hint_type ?? classification.document_type) as string;

  // ---- 5. Generate embedding for the whole document ----
  let docEmbedding: number[];
  try {
    docEmbedding = await getEmbedding(`${classification.suggested_title}\n\n${classification.summary}\n\n${rawText.slice(0, 4000)}`);
  } catch (err) {
    return errorResponse(500, "embedding_failed", (err as Error).message);
  }

  // ---- 6. Semantic-duplicate check ----
  const { data: similarChunks } = await supabase.rpc("find_similar_chunks", {
    p_org_id: org_id,
    p_query_embedding: docEmbedding,
    p_threshold: 0.85,
    p_limit: 3,
  });

  // ---- 7. Insert document ----
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      org_id,
      project_id: finalProjectId,
      title: providedTitle ?? classification.suggested_title,
      document_type: finalType,
      file_hash: contentHash,
      mime_type: source === "paste" ? "text/plain" : "text/html",
      size_bytes: rawText.length,
      extracted_text: rawText,
      summary: classification.summary,
      source,
      source_url: sourceUrl,
      tags: classification.tags,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (docErr) return errorResponse(500, "document_insert_failed", docErr.message);

  // ---- 8. Chunk + embed each section ----
  const chunks = chunkText(rawText, 2000);
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    let embedding: number[];
    try {
      embedding = await getEmbedding(chunkText);
    } catch {
      continue;  // skip failed chunks rather than fail the whole ingest
    }

    await supabase.from("knowledge_chunks").insert({
      org_id,
      project_id: finalProjectId,
      document_id: doc.id,
      content: chunkText,
      embedding,
      chunk_index: i,
      metadata: { source, classification_confidence: classification.confidence },
    });
  }

  // ---- 9. Record duplicate detections (if any) ----
  if (similarChunks && similarChunks.length > 0) {
    for (const match of similarChunks) {
      await supabase.from("duplicate_detections").insert({
        org_id,
        new_document_id: doc.id,
        similar_chunk_id: match.chunk_id,
        existing_document_id: match.document_id,
        similarity_score: match.similarity,
        diff_summary: `Similar to "${match.document_title}" (${Math.round(match.similarity * 100)}% match in section "${match.section ?? "—"}")`,
        resolution: "pending",
      });
    }
  }

  // ---- 10. Activity log ----
  await supabase.from("activity_log").insert({
    org_id,
    project_id: finalProjectId,
    user_id: user.id,
    activity_type: "document_added",
    summary: `Added "${doc.title}" (${classification.document_type})`,
    related_document_id: doc.id,
    detail: { confidence: classification.confidence },
  });

  return json(200, {
    status: "ingested",
    document_id: doc.id,
    title: doc.title,
    classification,
    duplicate_warnings: similarChunks ?? [],
    chunks_created: chunks.length,
  });
});
