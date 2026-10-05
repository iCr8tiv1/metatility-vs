"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireGenesisContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) throw new Error("Genesis workspace is unavailable.");

  return { supabase, ownerId, workspaceId: workspace.id };
}

export async function setAgentStatus(formData: FormData) {
  const { supabase, workspaceId } = await requireGenesisContext();
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!agentId || !["active", "paused"].includes(status)) {
    redirect("/agents?error=Invalid%20agent%20status%20request");
  }

  const { error } = await supabase
    .from("genesis_agents")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", agentId);

  if (error) redirect("/agents?error=Agent%20status%20could%20not%20be%20updated");

  revalidatePath("/");
  revalidatePath("/agents");
  redirect(`/agents?updated=${status}`);
}

export async function createKnowledgeSource(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();

  const name = String(formData.get("name") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const uri = String(formData.get("uri") ?? "").trim();
  const trustLevel = String(formData.get("trustLevel") ?? "unverified").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const allowedTrust = ["authoritative", "internal", "reference", "unverified"];

  if (!name || !sourceType || !allowedTrust.includes(trustLevel)) {
    redirect("/knowledge?error=Complete%20the%20required%20source%20fields");
  }

  const { error } = await supabase.from("genesis_knowledge_sources").insert({
    workspace_id: workspaceId,
    owner_id: ownerId,
    source_type: sourceType,
    name,
    uri: uri || null,
    status: "active",
    metadata: {
      trust_level: trustLevel,
      scope: scope || null,
      notes: notes || null,
      verification_status:
        trustLevel === "authoritative" || trustLevel === "internal"
          ? "operator_asserted"
          : "unverified",
      credentials_stored: false,
    },
  });

  if (error) redirect("/knowledge?error=Knowledge%20source%20could%20not%20be%20registered");

  revalidatePath("/knowledge");
  redirect("/knowledge?created=1");
}

export async function setKnowledgeSourceStatus(formData: FormData) {
  const { supabase, workspaceId } = await requireGenesisContext();
  const sourceId = String(formData.get("sourceId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!sourceId || !["active", "paused", "archived"].includes(status)) {
    redirect("/knowledge?error=Invalid%20knowledge%20source%20status");
  }

  const { error } = await supabase
    .from("genesis_knowledge_sources")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", sourceId);

  if (error) redirect("/knowledge?error=Knowledge%20source%20status%20could%20not%20be%20updated");

  revalidatePath("/knowledge");
  redirect(`/knowledge?updated=${status}`);
}
