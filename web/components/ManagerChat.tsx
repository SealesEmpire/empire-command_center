"use client";

import { useEffect, useRef, useState } from "react";

interface ToolEvent {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
}

const SUGGESTIONS = [
  "Create a project called 'Brand Launch' and add 3 cinematic scenes for a tech startup hero film.",
  "Show me my projects.",
  "Generate every pending scene in my latest project, then check progress.",
];

export default function ManagerChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setTurns((cur) => [
        ...cur,
        { role: "assistant", content: data.reply, tools: data.toolEvents },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div>
        <div className="row spread">
          <a href="/" className="muted" style={{ fontSize: 12 }}>
            ← Dashboard
          </a>
          <a href="/manager/settings" className="muted" style={{ fontSize: 12 }}>
            Knowledge ⚙
          </a>
        </div>
        <h1 style={{ marginTop: 6 }}>Manager bot</h1>
        <p className="muted">
          Talk to the platform. It plans and drives the video pipeline for you —
          creating projects, writing scene prompts, generating, approving, and
          assembling.
        </p>
      </div>

      {turns.length === 0 && (
        <div className="card">
          <h2>Try</h2>
          <div className="divider" />
          <div className="stack" style={{ gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        {turns.map((t, i) => (
          <div key={i} className={`card ${t.role === "user" ? "msg-user" : ""}`}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              {t.role === "user" ? "You" : "Manager"}
            </div>
            {t.tools && t.tools.length > 0 && (
              <div className="stack" style={{ gap: 4, marginBottom: 10 }}>
                {t.tools.map((ev, j) => (
                  <div
                    key={j}
                    className="muted"
                    style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                  >
                    <span className={`pill ${ev.isError ? "failed" : "approved"}`}>
                      {ev.name}
                    </span>{" "}
                    {ev.isError
                      ? String((ev.result as { error?: string })?.error ?? "error")
                      : "ok"}
                  </div>
                ))}
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
          </div>
        ))}
        {busy && (
          <div className="card">
            <span className="spinner" /> Working…
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        <div ref={endRef} />
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ position: "sticky", bottom: 16 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the Manager what to build…"
          disabled={busy}
        />
        <button className="btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
