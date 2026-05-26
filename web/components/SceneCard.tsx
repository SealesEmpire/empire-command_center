"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SIZES, ALLOWED_TASKS } from "@/lib/types";
import type { Scene, Asset, Job } from "@/lib/types";

const POLL_MS = 4000;
const NON_TERMINAL = new Set(["queued", "in_progress"]);

export default function SceneCard({
  index,
  total,
  scene,
  assets,
  latestJob,
  onChanged,
  onMove,
}: {
  index: number;
  total: number;
  scene: Scene;
  assets: Asset[];
  latestJob?: Job;
  onChanged: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene);
  const [pollJobId, setPollJobId] = useState<string | null>(
    latestJob && NON_TERMINAL.has(latestJob.status) ? latestJob.id : null
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pollJobId) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await api.syncJob(pollJobId!);
        const job: Job = res.job;
        const retried: Job | undefined = res.retriedJob;
        if (cancelled) return;
        if (retried) {
          setPollJobId(retried.id);
          timer.current = setTimeout(tick, POLL_MS);
          return;
        }
        if (NON_TERMINAL.has(job.status)) {
          timer.current = setTimeout(tick, POLL_MS);
        } else {
          setPollJobId(null);
          onChanged();
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPollJobId(null);
      }
    }

    timer.current = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pollJobId, onChanged]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { job } = await api.generate(scene.id);
      setPollJobId(job.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(assetId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.approve(scene.id, assetId);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      await api.updateScene(scene.id, {
        title: draft.title,
        prompt: draft.prompt,
        negative_prompt: draft.negative_prompt,
        size: draft.size,
        task: draft.task,
        sample_steps: draft.sample_steps,
        seed: draft.seed,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this scene?")) return;
    setBusy(true);
    try {
      await api.deleteScene(scene.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const generating = busy || pollJobId !== null;
  const failedJob = latestJob && latestJob.status === "failed" ? latestJob : null;

  return (
    <div className="scene">
      <div className="stack">
        <div className="row spread">
          <div className="row">
            <div className="reorder">
              <button
                className="btn-ghost btn-xs"
                title="Move up"
                onClick={() => onMove("up")}
                disabled={index === 0 || busy}
              >
                ▲
              </button>
              <button
                className="btn-ghost btn-xs"
                title="Move down"
                onClick={() => onMove("down")}
                disabled={index === total - 1 || busy}
              >
                ▼
              </button>
            </div>
            <span className="scene-num">{index + 1}</span>
            <strong>{scene.title || `Scene ${index + 1}`}</strong>
          </div>
          <div className="row">
            <span className={`pill ${pollJobId ? "generating" : scene.status}`}>
              {pollJobId ? "generating" : scene.status}
            </span>
            {!editing && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setDraft(scene);
                  setEditing(true);
                }}
                disabled={busy}
              >
                Edit
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={remove} disabled={busy}>
              Delete
            </button>
          </div>
        </div>

        {editing ? (
          <div className="stack" style={{ gap: 8 }}>
            <input
              value={draft.title ?? ""}
              placeholder="Title"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <textarea
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
            <textarea
              value={draft.negative_prompt}
              placeholder="Negative prompt"
              onChange={(e) =>
                setDraft({ ...draft, negative_prompt: e.target.value })
              }
            />
            <div className="row">
              <select
                value={draft.size}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              >
                {ALLOWED_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={draft.task}
                onChange={(e) => setDraft({ ...draft, task: e.target.value })}
              >
                {ALLOWED_TASKS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.sample_steps}
                onChange={(e) =>
                  setDraft({ ...draft, sample_steps: Number(e.target.value) })
                }
              />
              <input
                placeholder="seed (blank=random)"
                value={draft.seed ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    seed: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="row">
              <button className="btn-primary btn-sm" onClick={saveEdit} disabled={busy}>
                Save
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ margin: 0 }}>{scene.prompt}</p>
            {scene.negative_prompt && (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                neg: {scene.negative_prompt}
              </p>
            )}
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {scene.size} · {scene.sample_steps} steps ·{" "}
              {scene.seed === null ? "random seed" : `seed ${scene.seed}`} ·{" "}
              {scene.task}
            </p>
          </>
        )}

        {error && <div className="error-box">{error}</div>}
        {failedJob && !error && (
          <div className="error-box">
            {failedJob.error_code}: {failedJob.error}
          </div>
        )}

        {!editing && (
          <div className="row">
            <button
              className="btn-primary btn-sm"
              onClick={generate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="spinner" /> Generating…
                </>
              ) : assets.length > 0 ? (
                "Regenerate"
              ) : (
                "Generate"
              )}
            </button>
            {assets.length > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                {assets.length} take{assets.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="stack">
        {assets.length === 0 ? (
          <div
            className="empty"
            style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 8 }}
          >
            {generating ? "Rendering…" : "No takes yet"}
          </div>
        ) : (
          assets.map((a) => {
            const approved = scene.approved_asset_id === a.id;
            const seed = (a.metadata as Record<string, unknown>)?.seed;
            const elapsed = (a.metadata as Record<string, unknown>)
              ?.elapsed_seconds;
            return (
              <div key={a.id} className="stack" style={{ gap: 6 }}>
                {a.url && <video src={a.url} controls preload="metadata" />}
                <div className="row spread">
                  <span className="muted" style={{ fontSize: 11 }}>
                    {a.size_bytes ? `${(a.size_bytes / 1e6).toFixed(1)} MB` : ""}
                    {seed !== undefined ? ` · seed ${seed}` : ""}
                    {elapsed !== undefined ? ` · ${elapsed}s` : ""}
                  </span>
                  <button
                    className={approved ? "btn-success btn-sm" : "btn-sm"}
                    onClick={() => approve(a.id)}
                    disabled={busy || approved}
                  >
                    {approved ? "✓ Approved" : "Approve"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
