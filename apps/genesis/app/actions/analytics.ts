"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyticsAgent } from "@/lib/agents/analytics";
import { createClient } from "@/lib/supabase/server";

const ANALYTICS_MODEL = "openai/gpt-5.6-sol";

function countBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = String(row[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export async function runAnalyticsAgent() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) redirect("/analytics?error=Genesis%20workspace%20is%20unavailable");

  const [{ data: agent }, { data: objective }] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("agent_key", "analytics")
      .eq("status", "active")
      .single(),
    supabase
      .from("genesis_objectives")
      .select("id,title,objective,metrics")
      .eq("workspace_id", workspace.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!agent) redirect("/analytics?error=Analytics%20agent%20is%20paused%20or%20unavailable");

  const [
    { data: leads },
    { data: campaigns },
    { data: opportunities },
    { data: approvals },
    { data: nurturePlans },
    { data: integrations },
    { data: agentRuns },
    { data: events },
  ] = await Promise.all([
    supabase
      .from("genesis_leads")
      .select("id,source,status,score,confidence,created_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_campaigns")
      .select("id,channel,status,budget,spend,created_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_opportunities")
      .select("id,status,estimated_value,currency,created_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_approvals")
      .select("id,action_type,status,risk_level,requested_at,resolved_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_nurture_plans")
      .select("id,status,permission_basis,created_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_integrations")
      .select("integration_key,display_name,status,capabilities")
      .eq("workspace_id", workspace.id)
      .order("display_name"),
    supabase
      .from("genesis_agent_runs")
      .select("id,agent_id,status,provider,model,cost_usd,created_at")
      .eq("workspace_id", workspace.id)
      .limit(500),
    supabase
      .from("genesis_events")
      .select("id,event_type,source_system,entity_type,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const leadRows = leads ?? [];
  const campaignRows = campaigns ?? [];
  const opportunityRows = opportunities ?? [];
  const approvalRows = approvals ?? [];
  const nurtureRows = nurturePlans ?? [];
  const integrationRows = integrations ?? [];
  const runRows = agentRuns ?? [];
  const eventRows = events ?? [];

  const context = {
    objective,
    observed_telemetry: {
      leads: {
        total: leadRows.length,
        by_status: countBy(leadRows, "status"),
        by_source: countBy(leadRows, "source"),
      },
      campaigns: {
        total: campaignRows.length,
        by_status: countBy(campaignRows, "status"),
        by_channel: countBy(campaignRows, "channel"),
        recorded_budget: campaignRows.reduce(
          (sum, row) => sum + Number(row.budget ?? 0),
          0,
        ),
        recorded_spend: campaignRows.reduce(
          (sum, row) => sum + Number(row.spend ?? 0),
          0,
        ),
      },
      opportunities: {
        total: opportunityRows.length,
        by_status: countBy(opportunityRows, "status"),
        estimated_value_total: opportunityRows.reduce(
          (sum, row) => sum + Number(row.estimated_value ?? 0),
          0,
        ),
      },
      approvals: {
        total: approvalRows.length,
        by_status: countBy(approvalRows, "status"),
        by_action: countBy(approvalRows, "action_type"),
      },
      nurture: {
        plans: nurtureRows.length,
        by_status: countBy(nurtureRows, "status"),
        by_permission_basis: countBy(nurtureRows, "permission_basis"),
      },
      agent_runs: {
        total: runRows.length,
        by_status: countBy(runRows, "status"),
        recorded_cost_usd: runRows.reduce(
          (sum, row) => sum + Number(row.cost_usd ?? 0),
          0,
        ),
      },
      recent_events: {
        count: eventRows.length,
        by_type: countBy(eventRows, "event_type"),
        by_source_system: countBy(eventRows, "source_system"),
      },
    },
    evidence_boundary: {
      integrations: integrationRows,
      note:
        "Disconnected integrations mean Genesis does not yet possess the corresponding external evidence. Zero external observations must not be interpreted as zero business activity.",
    },
  };

  const { data: run, error: runError } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: objective?.id ?? null,
      status: "running",
      input: context,
      provider: "vercel-ai-gateway",
      model: ANALYTICS_MODEL,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    redirect("/analytics?error=Analytics%20run%20could%20not%20be%20created");
  }

  try {
    const result = await analyticsAgent.generate({
      prompt: JSON.stringify(context),
    });

    if (!result.output) throw new Error("Analytics agent returned no output.");

    const output = result.output;

    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "completed",
        output,
        usage: result.usage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await supabase.from("genesis_recommendations").insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: objective?.id ?? null,
      title: "Analytics: next measurement action",
      summary: output.recommendedExperiment.action,
      rationale: output.recommendedExperiment.whyNow,
      expected_impact: {
        primary_metric: output.recommendedExperiment.primaryMetric,
        success_condition: output.recommendedExperiment.successCondition,
        data_needed: output.recommendedExperiment.dataNeeded,
        confidence: output.confidence,
        measurement_gaps: output.measurementGaps,
      },
      status: "open",
      priority: 3,
      action: {
        mode: "recommend_only",
        requires_human_review: true,
      },
    });

    await supabase.from("genesis_events").insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      event_type: "analytics.insight_generated",
      source_system: "genesis",
      entity_type: "agent_run",
      entity_id: run.id,
      idempotency_key: `analytics-insight:${run.id}`,
      payload: {
        confidence: output.confidence,
        recommended_action: output.recommendedExperiment.action,
        primary_metric: output.recommendedExperiment.primaryMetric,
      },
    });
  } catch (error) {
    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Analytics insight generation failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    redirect("/analytics?error=Analytics%20agent%20could%20not%20complete%20the%20analysis");
  }

  revalidatePath("/");
  revalidatePath("/analytics");
  redirect("/analytics?analysis=complete");
}
