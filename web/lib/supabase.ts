import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Server-side Supabase client using the service role key. This bypasses RLS,
// so it MUST never be imported into client components. Keep it behind API
// routes and server components only.
let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
