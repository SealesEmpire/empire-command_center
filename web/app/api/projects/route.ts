import { supabaseAdmin } from "@/lib/supabase";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok({ projects: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return badRequest("name is required");

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("projects")
      .insert({
        name,
        description:
          typeof body.description === "string" ? body.description : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ project: data }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
