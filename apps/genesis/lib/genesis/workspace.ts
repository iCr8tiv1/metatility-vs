import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const FOUNDATION_WORKSPACE_COOKIE = "genesis_workspace";
export type FoundationWorkspace = { id: string; name: string; slug: string };

export async function getFoundationWorkspace(supabase: SupabaseClient, ownerId: string) {
  const selectedId = (await cookies()).get(FOUNDATION_WORKSPACE_COOKIE)?.value;
  const { data, error } = await supabase.from("genesis_workspaces")
    .select("id,name,slug").eq("owner_id", ownerId).order("created_at").limit(100);
  const workspaces = (data ?? []) as FoundationWorkspace[];
  const workspace = workspaces.find((item) => item.id === selectedId)
    ?? workspaces.find((item) => item.slug === "genesis") ?? workspaces[0] ?? null;
  return { workspace, workspaces, error };
}

export async function requireFoundationContext(requestedWorkspaceId?: string) {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (authError || !ownerId) redirect("/login");
  const scope = await getFoundationWorkspace(supabase, ownerId);
  const workspace = requestedWorkspaceId ? scope.workspaces.find((item) => item.id === requestedWorkspaceId) : scope.workspace;
  if (scope.error || !workspace) redirect("/foundation?status=workspace-error");
  return { supabase, ownerId, workspace, workspaces: scope.workspaces };
}
