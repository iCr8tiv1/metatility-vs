"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { genesisDirectorAgent } from "@/lib/agents/director";

const DIRECTOR_MODEL = "openai/gpt-5.6-sol";

export async function runGenesisDirector() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) redirect("/?director=workspace-error");

  const [{ data: director }, { data: objective }] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("agent_key", "director")
      .eq("status", "active")
      .single(),
    supabase
      .from("genesis_objectives")
      .select("id,title,objective,status,metrics")
      .eq("workspace_id", workspace.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!director) redirect("/?director=agent-error");

  const [
    { count: leadCount },
    { count: qualifiedCount },
    { count: nurtureCount },
    { count: opportunityCount },
    { count: approvalCount },
    { count: marketBriefCount },
    { count: campaignCount },
    { data: integrations },
  ] = await Promise.all([
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "qualified"),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "nurture"),
    supabase
      .from("genesis_opportunities")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_approvals")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "pending"),
    supabase
      .from("genesis_market_briefs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_integrations")
      .select("integration_key,display_name,status,capabilities")
      .eq("workspace_id", workspace.id)
      .order("display_name"),
  ]);

  const context = {
    objective: objective
      ? {
          title: objective.title,
          objective: objective.objective,
          metrics: objective.metrics,
        }
      : null,
    funnel: {
      leads: leadCount ?? 0,
      qualified: qualifiedCount ?? 0,
      nurture: nurtureCount ?? 0,
      opportunities: opportunityCount ?? 0,
      approvalsPending: approvalCount ?? 0,
    },
    demandEngine: {
      marketBriefs: marketBriefCount ?? 0,
      campaigns: campaignCount ?? 0,
    },
    integrations: integrations ?? [],
  };

  const { data: run, error: runError } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      agent_id: director.id,
      objective_id: objective?.id ?? null,
      status: "running",
      input: context,
      provider: "vercel-ai-gateway",
      model: DIRECTOR_MODEL,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) redirect("/?director=run-error");

  try {
    const result = await genesisDirectorAgent.generate({
      prompt: JSON.stringify(context),
    });

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
      agent_id: director.id,
      objective_id: objective?.id ?? null,
      title: "Genesis Director: next action",
      summary: output.recommendedAction,
      rationale: output.rationale,
      expected_impact: {
        primary_metric: output.primaryMetric,
        expected_learning: output.expectedLearning,
      },
      status: "open",
      priority: 3,
      action: {
        mode: "recommend_only",
        requires_human_review: output.requiresHumanReview,
      },
    });
  } catch (error) {
    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Director execution failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    redirect("/?director=execution-error");
  }

  revalidatePath("/");
  redirect("/?director=complete");
}
