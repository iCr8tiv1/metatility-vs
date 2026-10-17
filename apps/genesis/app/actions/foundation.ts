"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { foundationRpc } from "@/lib/genesis/runtime-server";
import { FOUNDATION_WORKSPACE_COOKIE } from "@/lib/genesis/workspace";

async function rememberWorkspace(workspaceId: string) {
  (await cookies()).set(FOUNDATION_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31_536_000 });
  revalidatePath("/", "layout");
}

export async function selectFoundationWorkspace(formData: FormData) {
  const workspaceId = z.uuid().safeParse(formData.get("workspaceId"));
  if (!workspaceId.success) redirect("/foundation?status=workspace-error");
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const { data: workspace, error } = await supabase.from("genesis_workspaces").select("id").eq("id", workspaceId.data).eq("owner_id", auth.claims.sub).maybeSingle();
  if (error || !workspace) redirect("/foundation?status=workspace-error");
  await rememberWorkspace(workspace.id);
  redirect("/foundation");
}

export async function initializeGenesisFoundation(formData: FormData) {
  const workspaceId = formData.get("workspaceId");
  if (workspaceId && !z.uuid().safeParse(workspaceId).success) redirect("/foundation?status=workspace-error");
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  let initializedId: string;
  try {
    const result = await foundationRpc(supabase, "genesis_initialize_foundation", { p_workspace_id: workspaceId || null, p_name: "Genesis" });
    initializedId = z.object({ workspace_id: z.uuid() }).parse(result).workspace_id;
  } catch { redirect("/foundation?status=initialization-failed"); }
  await rememberWorkspace(initializedId);
  redirect("/foundation?status=initialized");
}
