"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  captureAndQualifyLead,
  type LeadIntake,
} from "@/lib/genesis/lead-workflow";

function boolFromForm(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export async function createLead(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const budget = Number(formData.get("budget") ?? 0);
  const timelineValue = String(formData.get("timeline") ?? "12+");
  const timeline: LeadIntake["timeline"] =
    timelineValue === "0-3" ||
    timelineValue === "3-6" ||
    timelineValue === "6-12"
      ? timelineValue
      : "12+";

  const intake: LeadIntake = {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    source: String(formData.get("source") ?? "manual").trim(),
    projectType: String(formData.get("projectType") ?? "").trim(),
    projectDescription: String(formData.get("projectDescription") ?? "").trim(),
    budget: Number.isFinite(budget) ? Math.max(0, budget) : 0,
    timeline,
    serviceAreaFit: boolFromForm(formData.get("serviceAreaFit")),
    decisionMaker: boolFromForm(formData.get("decisionMaker")),
  };

  if (!intake.firstName || !intake.lastName || !intake.email || !intake.projectType) {
    redirect("/leads?error=Required%20fields%20are%20missing");
  }

  let result;

  try {
    result = await captureAndQualifyLead(supabase, ownerId, intake);
  } catch {
    redirect("/leads?error=Lead%20workflow%20could%20not%20be%20completed");
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/approvals");
  redirect(
    `/leads?created=1&score=${result.score.overallScore}&recommendation=${result.score.recommendation}`
  );
}

export async function approveBildenHandoff(formData: FormData) {
  const approvalId = String(formData.get("approvalId") ?? "");
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,workspace_id,owner_id,status,payload")
    .eq("id", approvalId)
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Approval%20is%20not%20available");
  }

  const payload = approval.payload as {
    lead_id?: string;
    qualification_id?: string;
    estimated_value?: number;
    currency?: string;
  };

  if (!payload.lead_id) {
    redirect("/approvals?error=Approval%20payload%20is%20invalid");
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from("genesis_opportunities")
    .insert({
      workspace_id: approval.workspace_id,
      owner_id: ownerId,
      lead_id: payload.lead_id,
      qualification_id: payload.qualification_id ?? null,
      external_system: "bilden",
      status: "ready",
      estimated_value: Number(payload.estimated_value ?? 0),
      currency: payload.currency ?? "USD",
      payload: {
        handoff_status: "staged",
        approved_from: approval.id,
      },
    })
    .select("id")
    .single();

  if (opportunityError || !opportunity) {
    redirect("/approvals?error=Opportunity%20could%20not%20be%20created");
  }

  await supabase
    .from("genesis_approvals")
    .update({
      status: "approved",
      resolved_at: new Date().toISOString(),
      resolution_note: "Approved for Bilden opportunity handoff.",
    })
    .eq("id", approval.id);

  await supabase.from("genesis_events").insert({
    workspace_id: approval.workspace_id,
    owner_id: ownerId,
    event_type: "opportunity.ready",
    source_system: "genesis",
    entity_type: "opportunity",
    entity_id: opportunity.id,
    idempotency_key: `opportunity-ready:${opportunity.id}`,
    payload: {
      approval_id: approval.id,
      lead_id: payload.lead_id,
      external_system: "bilden",
    },
  });

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/approvals");
  redirect("/approvals?decision=approved");
}

export async function rejectBildenHandoff(formData: FormData) {
  const approvalId = String(formData.get("approvalId") ?? "");
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,owner_id,payload")
    .eq("id", approvalId)
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Approval%20is%20not%20available");
  }

  const payload = approval.payload as { lead_id?: string };

  await supabase
    .from("genesis_approvals")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      resolution_note: "Bilden handoff rejected; lead returned to nurture.",
    })
    .eq("id", approval.id);

  if (payload.lead_id) {
    await supabase
      .from("genesis_leads")
      .update({
        status: "nurture",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.lead_id);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/approvals");
  redirect("/approvals?decision=rejected");
}
