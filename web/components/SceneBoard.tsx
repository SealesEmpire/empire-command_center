"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function SceneBoard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
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

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <a href="/" className="muted" style={{ fontSize: 12 }}>
            ← All projects
          </a>
          <h1 style={{ marginTop: 6 }}>{project.name}</h1>
          <div className="row" style={{ marginTop: 4 }}>
            <span className={`pill ${project.status}`}>{project.status}</span>
            <span className="muted">
              {scenes.filter((s) => s.approved_asset_id).length}/{scenes.length}{" "}
              scenes approved
            </span>
          </div>
        </div>
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
            scene={scene}
            assets={assetsByScene[scene.id] ?? []}
            latestJob={latestJobByScene[scene.id]}
            onChanged={() => reloadRef.current()}
          />
        ))}
      </div>

      <AddSceneForm projectId={projectId} onAdded={load} />
    </div>
  );
}
