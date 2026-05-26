"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SIZES, ALLOWED_TASKS } from "@/lib/types";

export default function AddSceneForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(
    "low quality, blurry, watermark, text, flicker, distorted"
  );
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<string>("1280*704");
  const [task, setTask] = useState<string>("ti2v-5B");
  const [sampleSteps, setSampleSteps] = useState(30);
  const [seed, setSeed] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createScene({
        project_id: projectId,
        title: title.trim() || undefined,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt,
        size,
        task,
        sample_steps: sampleSteps,
        seed: seed === "" ? null : Number(seed),
      });
      setPrompt("");
      setTitle("");
      setSeed("");
      setOpen(false);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Add scene
      </button>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="row spread">
        <h2>New scene</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="divider" />
      <div className="field">
        <label>Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening shot" />
      </div>
      <div className="field">
        <label>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Cinematic aerial push-in toward a black glass headquarters at sunrise, ultra realistic, premium commercial lighting"
        />
      </div>
      <div className="field">
        <label>Negative prompt</label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
        />
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Size</label>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {ALLOWED_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Task</label>
          <select value={task} onChange={(e) => setTask(e.target.value)}>
            {ALLOWED_TASKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Steps</label>
          <input
            type="number"
            min={1}
            max={100}
            value={sampleSteps}
            onChange={(e) => setSampleSteps(Number(e.target.value))}
          />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label>Seed (blank = random)</label>
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn-primary" disabled={busy || !prompt.trim()}>
        {busy ? "Adding…" : "Add scene"}
      </button>
    </form>
  );
}
