"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project, LedgerSummary } from "@/lib/types";
import PnL from "@/components/PnL";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finance, setFinance] = useState<LedgerSummary | null>(null);
  const [revAmount, setRevAmount] = useState("");
  const [revNote, setRevNote] = useState("");

  async function loadFinance() {
    try {
      const res = await fetch("/api/ledger", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setFinance(data.summary);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
      await loadFinance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function addRevenue(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(revAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "revenue",
          amount_usd: amount,
          description: revNote.trim() || undefined,
        }),
      });
      setRevAmount("");
      setRevNote("");
      await loadFinance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(e: React.MouseEvent, id: string, pname: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete project "${pname}" and all its scenes?`)) return;
    try {
      await api.deleteProject(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createProject(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Projects</h1>
        <p className="muted">Each project is a video built from approved scene clips.</p>
      </div>

      {finance && (
        <div className="card">
          <div className="row spread" style={{ flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2>Profit &amp; Loss</h2>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Generation costs are tracked automatically. Log income below.
              </p>
            </div>
            <PnL summary={finance} />
          </div>
          <div className="divider" />
          <form className="row" onSubmit={addRevenue}>
            <input
              value={revAmount}
              onChange={(e) => setRevAmount(e.target.value)}
              placeholder="Revenue $"
              inputMode="decimal"
              style={{ maxWidth: 130 }}
            />
            <input
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
              placeholder="Note (e.g. client X payment)"
            />
            <button className="btn-success" disabled={!revAmount.trim()}>
              + Revenue
            </button>
          </form>
        </div>
      )}

      <form className="card" onSubmit={create}>
        <h2>New project</h2>
        <div className="divider" />
        <div className="field">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 Brand Launch Film"
          />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="60s hero film for the homepage"
          />
        </div>
        <button className="btn-primary" disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create project"}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">
          <span className="spinner" /> Loading…
        </div>
      ) : projects.length === 0 ? (
        <div className="empty">No projects yet. Create one above.</div>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <a key={p.id} href={`/projects/${p.id}`} className="card">
              <div className="row spread">
                <h2>{p.name}</h2>
                <div className="row">
                  <span className={`pill ${p.status}`}>{p.status}</span>
                  <button
                    className="btn-ghost btn-xs"
                    title="Delete project"
                    onClick={(e) => remove(e, p.id, p.name)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {p.description && (
                <p className="muted" style={{ marginTop: 8 }}>
                  {p.description}
                </p>
              )}
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                {new Date(p.created_at).toLocaleString()}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
