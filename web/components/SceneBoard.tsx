"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Project, Scene, Asset, Job } from "@/lib/types";
import SceneCard from "./SceneCard";
import AddSceneForm from "./AddSceneForm";

interface ProjectPayload {
  project: Project;
  scenes: Scene[];
  assetsByScene: Record<string, Asset[]>;
  latestJobByScene: Record<string, Job>;
}

const BUSY_STATUSES = new Set(["queued", "generating"]);

export default function SceneBoard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const reloadRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    try {
      const payload = await api.getProject(projectId);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  reloadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="error-box">{error}</div>;
  if (!data)
    return (
      <div className="empty">
        <span className="spinner" /> Loading project…
      </div>
    );

  const { project, scenes, assetsByScene, latestJobByScene } = data;
  const allApproved =
    scenes.length > 0 && scenes.every((s) => s.approved_asset_id);
  const pendingCount = scenes.filter(
    (s) => !BUSY_STATUSES.has(s.status) && s.status !== "approved"
  ).length;

  async function assemble() {
    setAssembling(true);
    setError(null);
    try {
      await api.assemble(projectId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssembling(false);
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    try {
      const targets = scenes.filter(
        (s) => !BUSY_STATUSES.has(s.status) && s.status !== "approved"
      );
      for (const s of targets) {
        await api.generate(s.id);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingAll(false);
    }
  }

  async function move(idx: number, dir: "up" | "down") {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= scenes.length) return;
    const ids = scenes.map((s) => s.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    // optimistic reorder
    const reordered = ids.map((id) => scenes.find((s) => s.id === id)!);
    setData({ ...data!, scenes: reordered });
    try {
      await api.reorderScenes(projectId, ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  async function saveName() {
    if (!nameDraft.trim()) return setRenaming(false);
    try {
      await api.updateProject(projectId, { name: nameDraft.trim() });
      setRenaming(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteProject() {
    if (!confirm(`Delete project "${project.name}" and all its scenes?`)) return;
    try {
      await api.deleteProject(projectId);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <a href="/" className="muted" style={{ fontSize: 12 }}>
            ← All projects
          </a>
          {renaming ? (
            <div className="row" style={{ marginTop: 6 }}>
              <input
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                style={{ width: 320 }}
              />
              <button className="btn-primary btn-sm" onClick={saveName}>
                Save
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 6 }}>
              <h1 style={{ margin: 0 }}>{project.name}</h1>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setNameDraft(project.name);
                  setRenaming(true);
                }}
              >
                Rename
              </button>
            </div>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`pill ${project.status}`}>{project.status}</span>
            <span className="muted">
              {scenes.filter((s) => s.approved_asset_id).length}/{scenes.length}{" "}
              scenes approved
            </span>
          </div>
        </div>
        <div className="row">
          <button
            className="btn-ghost btn-sm"
            onClick={deleteProject}
            title="Delete project"
          >
            Delete project
          </button>
          <button
            onClick={generateAll}
            disabled={generatingAll || pendingCount === 0}
            title="Generate every scene that isn't approved or already running"
          >
            {generatingAll ? (
              <>
                <span className="spinner" /> Queuing…
              </>
            ) : (
              `Generate all (${pendingCount})`
            )}
          </button>
          <button
            className="btn-success"
            disabled={!allApproved || assembling}
            onClick={assemble}
            title={
              allApproved
                ? "Stitch approved clips into the final video"
                : "Approve a clip for every scene first"
            }
          >
            {assembling ? (
              <>
                <span className="spinner" /> Assembling…
              </>
            ) : (
              "Assemble final video"
            )}
          </button>
        </div>
      </div>

      {project.final_video_url && (
        <div className="card">
          <div className="row spread">
            <h2>Final video</h2>
            <a className="btn btn-sm" href={project.final_video_url} target="_blank">
              Download
            </a>
          </div>
          <div className="divider" />
          <video src={project.final_video_url} controls style={{ maxWidth: 640 }} />
        </div>
      )}

      <div className="stack">
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.id}
            index={i}
            total={scenes.length}
            scene={scene}
            assets={assetsByScene[scene.id] ?? []}
            latestJob={latestJobByScene[scene.id]}
            onChanged={() => reloadRef.current()}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </div>

      <AddSceneForm projectId={projectId} onAdded={load} />
    </div>
  );
}
