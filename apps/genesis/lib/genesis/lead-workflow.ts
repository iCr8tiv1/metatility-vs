import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadIntake = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source: string;
  projectType: string;
  projectDescription: string;
  budget: number;
  timeline: "0-3" | "3-6" | "6-12" | "12+";
  serviceAreaFit: boolean;
  decisionMaker: boolean;
};

type ScoreResult = {
  fitScore: number;
  intentScore: number;
  budgetScore: number;
  timingScore: number;
  overallScore: number;
  confidence: number;
  recommendation: "create_bilden_opportunity" | "nurture" | "disqualify";
  reasons: string[];
};

function scoreBudget(budget: number) {
  if (budget >= 150000) return 100;
  if (budget >= 75000) return 85;
  if (budget >= 40000) return 65;
  return 40;
}

function scoreTimeline(timeline: LeadIntake["timeline"]) {
  if (timeline === "0-3") return 100;
  if (timeline === "3-6") return 90;
  if (timeline === "6-12") return 75;
  return 50;
}

export function scoreLead(intake: LeadIntake): ScoreResult {
  const fitScore = intake.serviceAreaFit ? 100 : 20;
  const intentScore = intake.decisionMaker ? 95 : 65;
  const budgetScore = scoreBudget(intake.budget);
  const timingScore = scoreTimeline(intake.timeline);
  const overallScore = Math.round(
    fitScore * 0.35 +
      intentScore * 0.25 +
      budgetScore * 0.2 +
      timingScore * 0.2
  );

  const evidenceCount = [
    Boolean(intake.email),
    Boolean(intake.phone),
    Boolean(intake.projectType),
    intake.projectDescription.trim().length >= 20,
    intake.budget > 0,
  ].filter(Boolean).length;

  const confidence = Number(Math.min(0.95, 0.6 + evidenceCount * 0.07).toFixed(2));
  const reasons: string[] = [];

  reasons.push(
    intake.serviceAreaFit
      ? "Lead is inside the configured service area."
      : "Lead is outside the configured service area."
  );
  reasons.push(
    intake.decisionMaker
      ? "Contact identifies as a project decision-maker."
      : "Decision-making authority is not yet confirmed."
  );
  reasons.push(
    intake.budget >= 75000
      ? "Declared budget meets the current high-value opportunity threshold."
      : "Declared budget should be validated before sales handoff."
  );
  reasons.push(
    intake.timeline === "0-3" || intake.timeline === "3-6"
      ? "Project timing indicates near-term intent."
      : "Project timing indicates a longer nurture horizon."
  );

  const recommendation =
    overallScore >= 80
      ? "create_bilden_opportunity"
      : overallScore >= 55
        ? "nurture"
        : "disqualify";

  return {
    fitScore,
    intentScore,
    budgetScore,
    timingScore,
    overallScore,
    confidence,
    recommendation,
    reasons,
  };
}

export async function captureAndQualifyLead(
  supabase: SupabaseClient,
  ownerId: string,
  intake: LeadIntake
) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (workspaceError || !workspace) {
    throw new Error("Genesis workspace is unavailable.");
  }

  const { data: agent, error: agentError } = await supabase
    .from("genesis_agents")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("agent_key", "lead_intelligence")
    .eq("status", "active")
    .single();

  if (agentError || !agent) {
    throw new Error("Lead Intelligence agent is unavailable.");
  }

  const { data: lead, error: leadError } = await supabase
    .from("genesis_leads")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      source: intake.source || "manual",
      status: "new",
      first_name: intake.firstName,
      last_name: intake.lastName,
      email: intake.email,
      phone: intake.phone || null,
      project_intent: {
        project_type: intake.projectType,
        description: intake.projectDescription,
        declared_budget: intake.budget,
        timeline: intake.timeline,
        service_area_fit: intake.serviceAreaFit,
        decision_maker: intake.decisionMaker,
      },
      attribution: {
        source: intake.source || "manual",
      },
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    throw new Error("Lead could not be created.");
  }

  const { data: createdEvent } = await supabase
    .from("genesis_events")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      event_type: "lead.created",
      source_system: "genesis",
      entity_type: "lead",
      entity_id: lead.id,
      idempotency_key: `lead-created:${lead.id}`,
      payload: { source: intake.source || "manual" },
    })
    .select("id")
    .single();

  const score = scoreLead(intake);

  const { data: run, error: runError } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      agent_id: agent.id,
      trigger_event_id: createdEvent?.id ?? null,
      status: "completed",
      input: {
        lead_id: lead.id,
        project_intent: intake,
      },
      output: score,
      provider: "genesis-rules",
      model: "lead-qualification-v0.1",
      usage: { deterministic: true },
      cost_usd: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error("Lead Intelligence run could not be recorded.");
  }

  const { data: qualification, error: qualificationError } = await supabase
    .from("genesis_qualifications")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      lead_id: lead.id,
      agent_id: agent.id,
      fit_score: score.fitScore,
      intent_score: score.intentScore,
      budget_score: score.budgetScore,
      timing_score: score.timingScore,
      overall_score: score.overallScore,
      confidence: score.confidence,
      recommendation: score.recommendation,
      reasons: score.reasons,
    })
    .select("id")
    .single();

  if (qualificationError || !qualification) {
    throw new Error("Lead qualification could not be recorded.");
  }

  const nextStatus =
    score.recommendation === "create_bilden_opportunity"
      ? "qualified"
      : score.recommendation === "nurture"
        ? "nurture"
        : "disqualified";

  await supabase
    .from("genesis_leads")
    .update({
      status: nextStatus,
      score: score.overallScore,
      confidence: score.confidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  await supabase.from("genesis_events").insert({
    workspace_id: workspace.id,
    owner_id: ownerId,
    event_type: "lead.qualified",
    source_system: "genesis",
    entity_type: "lead",
    entity_id: lead.id,
    idempotency_key: `lead-qualified:${qualification.id}`,
    payload: {
      qualification_id: qualification.id,
      agent_run_id: run.id,
      overall_score: score.overallScore,
      confidence: score.confidence,
      recommendation: score.recommendation,
    },
  });

  let approvalId: string | null = null;

  if (score.recommendation === "create_bilden_opportunity") {
    const { data: approval, error: approvalError } = await supabase
      .from("genesis_approvals")
      .insert({
        workspace_id: workspace.id,
        owner_id: ownerId,
        agent_id: agent.id,
        agent_run_id: run.id,
        action_type: "create_bilden_opportunity",
        risk_level: "high",
        status: "pending",
        payload: {
          lead_id: lead.id,
          qualification_id: qualification.id,
          estimated_value: intake.budget,
          currency: "USD",
        },
      })
      .select("id")
      .single();

    if (approvalError || !approval) {
      throw new Error("Approval request could not be created.");
    }

    approvalId = approval.id;

    await supabase.from("genesis_events").insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      event_type: "approval.requested",
      source_system: "genesis",
      entity_type: "approval",
      entity_id: approval.id,
      idempotency_key: `approval-requested:${approval.id}`,
      payload: {
        action_type: "create_bilden_opportunity",
        lead_id: lead.id,
      },
    });
  }

  return {
    leadId: lead.id,
    qualificationId: qualification.id,
    approvalId,
    score,
  };
}
