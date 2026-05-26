import { supabaseAdmin } from "./supabase";

// Editable Manager knowledge stored in the manager_settings singleton row.
// Reads are best-effort: if the table doesn't exist yet (migration 0002 not
// applied), return empty so the Manager still works.
export async function getManagerInstructions(): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .from("manager_settings")
      .select("instructions")
      .eq("id", "default")
      .maybeSingle<{ instructions: string }>();
    return data?.instructions ?? "";
  } catch {
    return "";
  }
}

export async function setManagerInstructions(instructions: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("manager_settings")
    .upsert({ id: "default", instructions });
  if (error) throw error;
}
