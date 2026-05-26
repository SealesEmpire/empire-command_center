import SceneBoard from "@/components/SceneBoard";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SceneBoard projectId={projectId} />;
}
