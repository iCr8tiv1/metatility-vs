"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nurtureAgent } from "@/lib/agents/nurture";
import { createClient } from "@/lib/supabase/server";

const NURTURE_MODEL = "openai/gpt-5.6-sol";

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

export async function generateNurturePlan(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();
  const leadId = String(formData.get("leadId") ?? "");

  if (!leadId) redirect("/nurture?error=Lead%20is%20required");

  const [
    { data: lead },
    { data: agent },
    { data: qualification },
    { data: touchpoints },
    { data: emailIntegration },
  ] = await Promise.all([
    supabase
      .from("genesis_leads")
      .select(
        "id,source,status,first_name,last_name,email,phone,property,project_intent,attribution,score,confidence,created_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", leadId)
      .single(),
    supabase
      .from("genesis_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("agent_key", "nurture")
      .eq("status", "active")
      .single(),
    supabase
      .from("genesis_qualifications")
      .select(
        "id,fit_score,intent_score,budget_score,timing_score,overall_score,confidence,recommendation,reasons,created_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("genesis_touchpoints")
      .select("id,channel,event_type,occurred_at,data")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("genesis_integrations")
      .select("status")
      .eq("workspace_id", workspaceId)
      .eq("integration_key", "email")
      .maybeSingle(),
  ]);

  if (!lead) redirect("/nurture?error=Lead%20is%20unavailable");
  if (!agent) redirect("/nurture?error=Nurture%20agent%20is%20paused%20or%20unavailable");

  if (!["nurture", "qualified", "new"].includes(lead.status)) {
    redirect("/nurture?error=Lead%20is%20not%20eligible%20for%20nurture%20planning");
  }

  const constrainedPermissionBasis =
    lead.source === "bilden_website"
      ? "inquiry_follow_up"
      : "unknown_or_unverified";

  const context = {
    lead: {
      id: lead.id,
      source: lead.source,
      status: lead.status,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      property: lead.property,
      project_intent: lead.project_intent,
      attribution: lead.attribution,
      score: lead.score,
      confidence: lead.confidence,
    },
    qualification,
    recent_touchpoints: touchpoints ?? [],
    permission_context: {
      maximum_allowed_basis: constrainedPermissionBasis,
      explanation:
        constrainedPermissionBasis === "inquiry_follow_up"
          ? "This lead came from the BILDEN project-intake form, which requires consent for BILDEN to review the project and contact the person about that inquiry. This is not general promotional marketing consent."
          : "Genesis has no verified communication-permission record for this lead.",
    },
    execution_boundary: {
      email_connector_connected: emailIntegration?.status === "connected",
      actual_delivery_allowed: false,
      human_review_required: true,
    },
  };

  const { data: run, error: runError } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      agent_id: agent.id,
      status: "running",
      input: context,
      provider: "vercel-ai-gateway",
      model: NURTURE_MODEL,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    redirect("/nurture?error=Nurture%20run%20could%20not%20be%20created");
  }

  try {
    const result = await nurtureAgent.generate({
      prompt: JSON.stringify(context),
    });

    if (!result.output) throw new Error("Nurture agent returned no output.");

    const output = {
      ...result.output,
      permissionBasis: constrainedPermissionBasis,
    };

    const { data: plan, error: planError } = await supabase
      .from("genesis_nurture_plans")
      .insert({
        workspace_id: workspaceId,
        owner_id: ownerId,
        lead_id: lead.id,
        agent_id: agent.id,
        status: "review",
        permission_basis: constrainedPermissionBasis,
        strategy: output.strategy,
        readiness_assessment: output.readinessAssessment,
        sequence: output.sequence,
        exit_criteria: output.exitCriteria,
        metadata: {
          evidence_needed: output.evidenceNeeded,
          email_connector_connected: emailIntegration?.status === "connected",
          execution_status: "review_required",
          actual_delivery_allowed: false,
        },
      })
      .select("id")
      .single();

    if (planError || !plan) {
      throw new Error("Nurture plan could not be stored.");
    }

    const { data: approval } = await supabase
      .from("genesis_approvals")
      .insert({
        workspace_id: workspaceId,
        owner_id: ownerId,
        agent_id: agent.id,
        agent_run_id: run.id,
        action_type: "approve_nurture_plan",
        risk_level: "medium",
        status: "pending",
        payload: {
          nurture_plan_id: plan.id,
          lead_id: lead.id,
          permission_basis: constrainedPermissionBasis,
          email_connector_connected: emailIntegration?.status === "connected",
          actual_delivery_allowed: false,
        },
      })
      .select("id")
      .single();

    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "completed",
        output: {
          nurture_plan_id: plan.id,
          ...output,
        },
        usage: result.usage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await supabase.from("genesis_events").insert([
      {
        workspace_id: workspaceId,
        owner_id: ownerId,
        event_type: "nurture.plan_created",
        source_system: "genesis",
        entity_type: "nurture_plan",
        entity_id: plan.id,
        idempotency_key: `nurture-plan-created:${plan.id}`,
        payload: {
          lead_id: lead.id,
          permission_basis: constrainedPermissionBasis,
          sequence_steps: output.sequence.length,
        },
      },
      ...(approval
        ? [
            {
              workspace_id: workspaceId,
              owner_id: ownerId,
              event_type: "approval.requested",
              source_system: "genesis",
              entity_type: "approval",
              entity_id: approval.id,
              idempotency_key: `nurture-approval-requested:${approval.id}`,
              payload: {
                action_type: "approve_nurture_plan",
                nurture_plan_id: plan.id,
                lead_id: lead.id,
              },
            },
          ]
        : []),
    ]);
  } catch (error) {
    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Nurture plan generation failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    redirect("/nurture?error=Nurture%20agent%20could%20not%20complete%20the%20plan");
  }

  revalidatePath("/");
  revalidatePath("/nurture");
  revalidatePath("/approvals");
  redirect("/nurture?created=1");
}

export async function approveNurturePlan(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();
  const approvalId = String(formData.get("approvalId") ?? "");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,owner_id,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .eq("action_type", "approve_nurture_plan")
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Nurture%20approval%20is%20not%20available");
  }

  const payload = approval.payload as {
    nurture_plan_id?: string;
    lead_id?: string;
  };

  if (!payload.nurture_plan_id) {
    redirect("/approvals?error=Nurture%20approval%20payload%20is%20invalid");
  }

  const { data: emailIntegration } = await supabase
    .from("genesis_integrations")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("integration_key", "email")
    .maybeSingle();

  const executionStatus =
    emailIntegration?.status === "connected"
      ? "approved_not_scheduled"
      : "awaiting_email_connector";

  await Promise.all([
    supabase
      .from("genesis_nurture_plans")
      .update({
        status: "approved",
        metadata: {
          execution_status: executionStatus,
          email_connector_connected: emailIntegration?.status === "connected",
          actual_delivery_allowed: false,
          plan_approved_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", payload.nurture_plan_id),
    supabase
      .from("genesis_approvals")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolution_note:
          "Nurture plan approved. Approval does not authorize automatic delivery.",
      })
      .eq("id", approval.id),
    supabase.from("genesis_events").insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      event_type: "nurture.plan_approved",
      source_system: "genesis",
      entity_type: "nurture_plan",
      entity_id: payload.nurture_plan_id,
      idempotency_key: `nurture-plan-approved:${approval.id}`,
      payload: {
        approval_id: approval.id,
        lead_id: payload.lead_id ?? null,
        execution_status: executionStatus,
        actual_delivery_allowed: false,
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/nurture");
  revalidatePath("/approvals");
  redirect("/approvals?decision=nurture-approved");
}

export async function rejectNurturePlan(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();
  const approvalId = String(formData.get("approvalId") ?? "");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,owner_id,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .eq("action_type", "approve_nurture_plan")
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Nurture%20approval%20is%20not%20available");
  }

  const payload = approval.payload as {
    nurture_plan_id?: string;
  };

  await supabase
    .from("genesis_approvals")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      resolution_note: "Nurture plan returned for revision.",
    })
    .eq("id", approval.id);

  if (payload.nurture_plan_id) {
    await supabase
      .from("genesis_nurture_plans")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", payload.nurture_plan_id);
  }

  await supabase.from("genesis_events").insert({
    workspace_id: workspaceId,
    owner_id: ownerId,
    event_type: "nurture.plan_rejected",
    source_system: "genesis",
    entity_type: "nurture_plan",
    entity_id: payload.nurture_plan_id ?? approval.id,
    idempotency_key: `nurture-plan-rejected:${approval.id}`,
    payload: {
      approval_id: approval.id,
    },
  });

  revalidatePath("/nurture");
  revalidatePath("/approvals");
  redirect("/approvals?decision=nurture-rejected");
}
