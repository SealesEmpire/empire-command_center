import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export default async function Home() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
