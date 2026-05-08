// =====================================================================
// Supabase client helpers
// =====================================================================

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — used in client components
export function createClient() {
  return createBrowserClient(URL, ANON);
}

// Server client — used in Server Components, Route Handlers, Server Actions
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      get(name: string)  { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: Record<string, unknown>) {
        try { cookieStore.set({ name, value, ...options }); }
        catch { /* called from a Server Component — ignore */ }
      },
      remove(name: string, options: Record<string, unknown>) {
        try { cookieStore.set({ name, value: "", ...options }); }
        catch { /* called from a Server Component — ignore */ }
      },
    },
  });
}
