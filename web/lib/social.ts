import { supabaseAdmin } from "./supabase";
import type { SocialPost } from "./types";

export interface CreatePostInput {
  projectId?: string | null;
  platform: string;
  content: string;
  hashtags?: string[];
  scheduledFor?: string | null;
}

export async function createPost(input: CreatePostInput): Promise<SocialPost> {
  const { data, error } = await supabaseAdmin()
    .from("social_posts")
    .insert({
      project_id: input.projectId ?? null,
      platform: input.platform.toLowerCase(),
      content: input.content,
      hashtags: input.hashtags ?? [],
      status: input.scheduledFor ? "scheduled" : "draft",
      scheduled_for: input.scheduledFor ?? null,
    })
    .select("*")
    .single<SocialPost>();
  if (error) throw error;
  return data;
}

export async function listPosts(projectId?: string): Promise<SocialPost[]> {
  let q = supabaseAdmin().from("social_posts").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q
    .order("created_at", { ascending: false })
    .returns<SocialPost[]>();
  return data ?? [];
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("social_posts").delete().eq("id", id);
  if (error) throw error;
}
