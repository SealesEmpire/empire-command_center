"use client";

import { useEffect, useState } from "react";

const PLACEHOLDER = `Teach the Manager your house rules. Examples:

- Brand: Empire — premium, cinematic, confident. Avoid cliché stock looks.
- Default video: 1280*704, 30 steps. Default negative prompt: "low quality, blurry, watermark, text, flicker".
- Always ask me before assembling a final video.
- For thumbnails, use generate_image txt2img at 1280*704.`;

export default function ManagerSettings() {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/manager/settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setInstructions(data.instructions ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/manager/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div>
        <a href="/manager" className="muted" style={{ fontSize: 12 }}>
          ← Manager bot
        </a>
        <h1 style={{ marginTop: 6 }}>Manager knowledge</h1>
        <p className="muted">
          This text is appended to the Manager&apos;s instructions on every turn —
          brand voice, default settings, house rules. It takes effect immediately;
          no redeploy needed.
        </p>
      </div>

      {loading ? (
        <div className="empty">
          <span className="spinner" /> Loading…
        </div>
      ) : (
        <div className="card stack">
          <textarea
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              setSaved(false);
            }}
            placeholder={PLACEHOLDER}
            style={{ minHeight: 280, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
          />
          {error && <div className="error-box">{error}</div>}
          <div className="row">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save knowledge"}
            </button>
            {saved && (
              <span className="muted" style={{ color: "var(--accent-2)" }}>
                ✓ Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
