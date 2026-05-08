"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState<"signin" | "signup">("signin");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-block w-14 h-14 rounded-2xl bg-gradient-to-br from-empire-neon to-empire-violet shadow-neonStrong mb-4" />
          <h1 className="text-2xl font-semibold">
            Empire <span className="text-empire-neon">Command</span>
          </h1>
          <p className="text-sm text-empire-textMuted mt-1">
            Mission control for everything you're building.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-empire-card border border-empire-border rounded-xl p-6 space-y-4">
          <div className="flex gap-1 bg-empire-bg rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-md text-sm transition-colors ${
                mode === "signin" ? "bg-empire-card text-empire-neon" : "text-empire-textMuted"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-md text-sm transition-colors ${
                mode === "signup" ? "bg-empire-card text-empire-neon" : "text-empire-textMuted"
              }`}
            >
              Sign up
            </button>
          </div>

          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-empire-bg border border-empire-border rounded-lg p-2.5 text-sm focus:border-empire-neon"
          />
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-empire-bg border border-empire-border rounded-lg p-2.5 text-sm focus:border-empire-neon"
          />

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-empire-neon text-empire-bg font-semibold py-2.5 rounded-lg hover:shadow-neonStrong disabled:opacity-50 flex items-center justify-center gap-2 transition-shadow"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
