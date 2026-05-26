// Browser-side fetch helpers. Safe to import in client components — contains
// no secrets and no server-only modules.

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listProjects: () => fetch("/api/projects").then(jsonOrThrow),

  createProject: (name: string, description?: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    }).then(jsonOrThrow),

  getProject: (id: string) =>
    fetch(`/api/projects/${id}`, { cache: "no-store" }).then(jsonOrThrow),

  updateProject: (id: string, patch: Record<string, unknown>) =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(jsonOrThrow),

  deleteProject: (id: string) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then(jsonOrThrow),

  reorderScenes: (projectId: string, sceneIds: string[]) =>
    fetch(`/api/projects/${projectId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_ids: sceneIds }),
    }).then(jsonOrThrow),

  createScene: (payload: Record<string, unknown>) =>
    fetch("/api/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(jsonOrThrow),

  updateScene: (sceneId: string, patch: Record<string, unknown>) =>
    fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(jsonOrThrow),

  deleteScene: (sceneId: string) =>
    fetch(`/api/scenes/${sceneId}`, { method: "DELETE" }).then(jsonOrThrow),

  generate: (sceneId: string) =>
    fetch(`/api/scenes/${sceneId}/generate`, { method: "POST" }).then(
      jsonOrThrow
    ),

  syncJob: (jobId: string) =>
    fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).then(jsonOrThrow),

  approve: (sceneId: string, assetId: string) =>
    fetch(`/api/scenes/${sceneId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId }),
    }).then(jsonOrThrow),

  assemble: (projectId: string) =>
    fetch(`/api/projects/${projectId}/assemble`, { method: "POST" }).then(
      jsonOrThrow
    ),
};
