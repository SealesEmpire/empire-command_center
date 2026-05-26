"use client";

import { useEffect, useState } from "react";
import type { SocialPost } from "@/lib/types";

export default function SocialBoard() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/social", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setPosts(data.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function fullText(p: SocialPost) {
    const tags = p.hashtags.length
      ? "\n\n" + p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
      : "";
    return p.content + tags;
  }

  async function copy(p: SocialPost) {
    try {
      await navigator.clipboard.writeText(fullText(p));
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this post?")) return;
    try {
      await fetch(`/api/social/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div>
        <a href="/" className="muted" style={{ fontSize: 12 }}>
          ← Dashboard
        </a>
        <h1 style={{ marginTop: 6 }}>Campaign library</h1>
        <p className="muted">
          Platform-ready posts the Manager wrote for your videos. Copy and publish.
          Ask the Manager: &ldquo;write a launch campaign for project X&rdquo;.
        </p>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">
          <span className="spinner" /> Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="empty">
          No posts yet. In the Manager, ask for a campaign and it&apos;ll save posts here.
        </div>
      ) : (
        <div className="stack">
          {posts.map((p) => (
            <div key={p.id} className="card">
              <div className="row spread">
                <div className="row">
                  <span className="pill approved">{p.platform}</span>
                  <span className={`pill ${p.status === "draft" ? "pending" : "generating"}`}>
                    {p.status}
                  </span>
                  {p.scheduled_for && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {new Date(p.scheduled_for).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="row">
                  <button className="btn-sm" onClick={() => copy(p)}>
                    {copiedId === p.id ? "✓ Copied" : "Copy"}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="divider" />
              <div style={{ whiteSpace: "pre-wrap" }}>{p.content}</div>
              {p.hashtags.length > 0 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  {p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
