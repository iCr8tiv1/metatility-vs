"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { taskIdSchema } from "@/lib/genesis/foundation-contract";
import { requireFoundationContext } from "@/lib/genesis/workspace";

async function requireGenesisContext(formData: FormData) {
  const requestedWorkspace = taskIdSchema.safeParse(formData.get("workspaceId"));
  if (!requestedWorkspace.success) redirect("/foundation?status=workspace-error");
  const { supabase, ownerId, workspace } = await requireFoundationContext(requestedWorkspace.data);
  return { supabase, ownerId, workspaceId: workspace.id };
}

export async function setAgentStatus(formData: FormData) {
  const { supabase, workspaceId } = await requireGenesisContext(formData);
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "");
  const expectedStatus = String(formData.get("expectedStatus") ?? "");

  if (!taskIdSchema.safeParse(agentId).success || !["active", "paused"].includes(status) ||
    !["active", "paused"].includes(expectedStatus)) {
    redirect("/agents?error=Invalid%20agent%20status%20request");
  }

  const { data: updatedAgent, error } = await supabase.rpc("genesis_set_agent_status", {
    p_workspace_id: workspaceId,
    p_agent_id: agentId,
    p_status: status,
    p_expected_status: expectedStatus,
  });

  if (error || !updatedAgent || updatedAgent.agent_id !== agentId || updatedAgent.status !== status) {
    redirect("/agents?error=Agent%20status%20could%20not%20be%20confirmed.%20Refresh%20before%20retrying.");
  }

  revalidatePath("/");
  revalidatePath("/agents");
  revalidatePath("/work");
  revalidatePath("/foundation");
  redirect(`/agents?updated=${status}`);
}

export async function createKnowledgeSource(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext(formData);

  const name = String(formData.get("name") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const uri = String(formData.get("uri") ?? "").trim();
  const trustLevel = String(formData.get("trustLevel") ?? "unverified").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const allowedTrust = ["authoritative", "internal", "reference", "unverified"];
  const allowedSourceTypes = ["internal_document", "brand_standard", "service_catalog", "case_study", "pricing_reference", "faq", "web_reference", "policy"];

  if (!name || name.length > 160 || !allowedSourceTypes.includes(sourceType) ||
    !allowedTrust.includes(trustLevel) || uri.length > 2000 || scope.length > 500 || notes.length > 5000) {
    redirect("/knowledge?error=Complete%20the%20required%20source%20fields");
  }

  const { data: createdSource, error } = await supabase.from("genesis_knowledge_sources").insert({
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
  }).select("id").single();

  if (error || !createdSource) redirect("/knowledge?error=Knowledge%20source%20could%20not%20be%20confirmed%20as%20registered");

  revalidatePath("/knowledge");
  redirect("/knowledge?created=1");
}

export async function setKnowledgeSourceStatus(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext(formData);
  const sourceId = String(formData.get("sourceId") ?? "");
  const status = String(formData.get("status") ?? "");
  const expectedStatus = String(formData.get("expectedStatus") ?? "");

  if (!taskIdSchema.safeParse(sourceId).success || !["active", "paused", "archived"].includes(status) ||
    !["active", "paused", "archived"].includes(expectedStatus)) {
    redirect("/knowledge?error=Invalid%20knowledge%20source%20status");
  }

  const { data: updatedSource, error } = await supabase
    .from("genesis_knowledge_sources")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("owner_id", ownerId)
    .eq("id", sourceId)
    .eq("status", expectedStatus)
    .select("id,status")
    .maybeSingle();

  if (error || !updatedSource || updatedSource.status !== status) {
    redirect("/knowledge?error=Knowledge%20source%20status%20could%20not%20be%20confirmed.%20Refresh%20before%20retrying.");
  }

  revalidatePath("/knowledge");
  redirect(`/knowledge?updated=${status}`);
}
