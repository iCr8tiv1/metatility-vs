"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { marketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { campaignPlannerAgent } from "@/lib/agents/campaign-planner";
import { createClient } from "@/lib/supabase/server";

const MARKET_MODEL = "openai/gpt-5.6-sol";
const CAMPAIGN_MODEL = "openai/gpt-5.6-sol";

function commaList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

export async function createMarketBrief(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();

  const title = String(formData.get("title") ?? "").trim();
  const geography = String(formData.get("geography") ?? "").trim();
  const serviceLines = commaList(formData.get("serviceLines"));
  const businessGoal = String(formData.get("businessGoal") ?? "").trim();
  const researchQuestion = String(formData.get("researchQuestion") ?? "").trim();

  if (!title || !geography || !serviceLines.length || !businessGoal) {
    redirect("/intelligence?error=Complete%20the%20brief%20before%20running%20intelligence");
  }

  const [
    { data: agent },
    { data: objective },
    { count: leadCount },
    { count: qualifiedCount },
    { count: opportunityCount },
    { data: integrations },
  ] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("agent_key", "market_intelligence")
      .single(),
    supabase
      .from("genesis_objectives")
      .select("id,title,objective,metrics")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "qualified"),
    supabase
      .from("genesis_opportunities")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("genesis_integrations")
      .select("integration_key,display_name,status,capabilities")
      .eq("workspace_id", workspaceId)
      .order("display_name"),
  ]);

  if (!agent) redirect("/intelligence?error=Market%20Intelligence%20agent%20is%20unavailable");

  const sourceSnapshot = {
    evidence_mode: "hypothesis",
    objective: objective
      ? {
          title: objective.title,
          objective: objective.objective,
          metrics: objective.metrics,
        }
      : null,
    internal_funnel: {
      leads: leadCount ?? 0,
      qualified: qualifiedCount ?? 0,
      opportunities: opportunityCount ?? 0,
    },
    integrations: integrations ?? [],
  };

  const { data: brief, error: briefError } = await supabase
    .from("genesis_market_briefs")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: objective?.id ?? null,
      title,
      geography,
      service_lines: serviceLines,
      business_goal: businessGoal,
      research_question: researchQuestion,
      evidence_mode: "hypothesis",
      status: "running",
      source_snapshot: sourceSnapshot,
    })
    .select("id")
    .single();

  if (briefError || !brief) {
    redirect("/intelligence?error=Market%20brief%20could%20not%20be%20created");
  }

  const { data: run } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: objective?.id ?? null,
      status: "running",
      input: {
        brief_id: brief.id,
        title,
        geography,
        service_lines: serviceLines,
        business_goal: businessGoal,
        research_question: researchQuestion,
        source_snapshot: sourceSnapshot,
      },
      provider: "vercel-ai-gateway",
      model: MARKET_MODEL,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  try {
    const result = await marketIntelligenceAgent.generate({
      prompt: JSON.stringify({
        operating_mode: "hypothesis",
        brief: {
          title,
          geography,
          service_lines: serviceLines,
          business_goal: businessGoal,
          research_question: researchQuestion,
        },
        internal_context: sourceSnapshot,
      }),
    });

    const output = result.output;
    if (!output) throw new Error("Market Intelligence returned no structured output.");

    await supabase
      .from("genesis_market_briefs")
      .update({
        status: "ready",
        summary: output.summary,
        market_hypotheses: output.marketHypotheses,
        demand_signals: output.demandSignals,
        competitor_hypotheses: output.competitorHypotheses,
        channel_hypotheses: output.channelHypotheses,
        evidence_gaps: output.evidenceGaps,
        confidence: output.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brief.id);

    await supabase.from("genesis_audiences").insert(
      output.audiences.map((audience) => ({
        workspace_id: workspaceId,
        owner_id: ownerId,
        market_brief_id: brief.id,
        name: audience.name,
        description: audience.description,
        geography: { market: geography },
        traits: audience.traits,
        problems: audience.problems,
        intents: audience.intents,
        objections: audience.objections,
        triggers: audience.triggers,
        exclusions: audience.exclusions,
        confidence: audience.confidence,
        status: "draft",
      }))
    );

    if (run?.id) {
      await supabase
        .from("genesis_agent_runs")
        .update({
          status: "completed",
          output,
          usage: result.usage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    await supabase.from("genesis_events").insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      event_type: "market_brief.ready",
      source_system: "genesis",
      entity_type: "market_brief",
      entity_id: brief.id,
      idempotency_key: `market-brief-ready:${brief.id}`,
      payload: {
        evidence_mode: "hypothesis",
        confidence: output.confidence,
        audience_count: output.audiences.length,
      },
    });
  } catch (error) {
    await supabase
      .from("genesis_market_briefs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", brief.id);

    if (run?.id) {
      await supabase
        .from("genesis_agent_runs")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : "Market Intelligence failed.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    redirect("/intelligence?error=Market%20Intelligence%20could%20not%20complete%20the%20brief");
  }

  revalidatePath("/");
  revalidatePath("/intelligence");
  revalidatePath("/audiences");
  redirect(`/intelligence?created=1&brief=${brief.id}`);
}

export async function planCampaign(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();

  const briefId = String(formData.get("briefId") ?? "");
  const audienceId = String(formData.get("audienceId") ?? "");

  if (!briefId || !audienceId) {
    redirect("/intelligence?error=Select%20an%20audience%20before%20planning%20a%20campaign");
  }

  const [
    { data: agent },
    { data: brief },
    { data: audience },
    { data: objective },
  ] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("agent_key", "campaign_planner")
      .single(),
    supabase
      .from("genesis_market_briefs")
      .select(
        "id,title,geography,service_lines,business_goal,summary,market_hypotheses,channel_hypotheses,evidence_gaps,confidence"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", briefId)
      .single(),
    supabase
      .from("genesis_audiences")
      .select(
        "id,name,description,geography,traits,problems,intents,objections,triggers,exclusions,confidence"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", audienceId)
      .single(),
    supabase
      .from("genesis_objectives")
      .select("id,title,objective,metrics")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!agent || !brief || !audience) {
    redirect("/intelligence?error=Campaign%20planning%20context%20is%20unavailable");
  }

  const context = {
    objective,
    market_brief: brief,
    audience,
    constraint: {
      activation_requires_human_approval: true,
      external_channel_execution: "not_connected",
    },
  };

  const { data: run } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: objective?.id ?? null,
      status: "running",
      input: context,
      provider: "vercel-ai-gateway",
      model: CAMPAIGN_MODEL,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  try {
    const result = await campaignPlannerAgent.generate({
      prompt: JSON.stringify(context),
    });

    const output = result.output;
    if (!output) throw new Error("Campaign Planner returned no structured output.");

    const { data: campaign, error: campaignError } = await supabase
      .from("genesis_campaigns")
      .insert({
        workspace_id: workspaceId,
        owner_id: ownerId,
        objective_id: objective?.id ?? null,
        market_brief_id: brief.id,
        audience_id: audience.id,
        name: output.name,
        channel: output.channel,
        status: "planned",
        audience: {
          id: audience.id,
          name: audience.name,
          description: audience.description,
        },
        budget: 0,
        spend: 0,
        hypothesis: output.hypothesis,
        offer: output.offer,
        primary_metric: output.primaryMetric,
        target_value: output.targetValue,
        metadata: {
          rationale: output.rationale,
          audience_strategy: output.audienceStrategy,
          test_design: output.testDesign,
          activation_approved: false,
        },
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign record could not be created.");
    }

    await supabase.from("genesis_campaign_assets").insert(
      output.assetBriefs.map((asset) => ({
        workspace_id: workspaceId,
        owner_id: ownerId,
        campaign_id: campaign.id,
        audience_id: audience.id,
        agent_id: agent.id,
        asset_type: asset.assetType,
        channel: output.channel,
        title: asset.title,
        content: asset.contentBrief,
        metadata: {
          stage: "brief",
          generated_by: "campaign_planner",
        },
        status: "draft",
      }))
    );

    const riskLevel = output.channel === "paid_search" ? "high" : "medium";

    const { data: approval } = await supabase
      .from("genesis_approvals")
      .insert({
        workspace_id: workspaceId,
        owner_id: ownerId,
        agent_id: agent.id,
        agent_run_id: run?.id ?? null,
        action_type: "activate_campaign",
        risk_level: riskLevel,
        status: "pending",
        payload: {
          campaign_id: campaign.id,
          market_brief_id: brief.id,
          audience_id: audience.id,
          channel: output.channel,
          proposed_budget: 0,
          external_execution_connected: false,
        },
      })
      .select("id")
      .single();

    await supabase.from("genesis_events").insert([
      {
        workspace_id: workspaceId,
        owner_id: ownerId,
        event_type: "campaign.planned",
        source_system: "genesis",
        entity_type: "campaign",
        entity_id: campaign.id,
        idempotency_key: `campaign-planned:${campaign.id}`,
        payload: {
          market_brief_id: brief.id,
          audience_id: audience.id,
          channel: output.channel,
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
              idempotency_key: `campaign-approval-requested:${approval.id}`,
              payload: {
                action_type: "activate_campaign",
                campaign_id: campaign.id,
              },
            },
          ]
        : []),
    ]);

    if (run?.id) {
      await supabase
        .from("genesis_agent_runs")
        .update({
          status: "completed",
          output: {
            campaign_id: campaign.id,
            ...output,
          },
          usage: result.usage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
  } catch (error) {
    if (run?.id) {
      await supabase
        .from("genesis_agent_runs")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : "Campaign planning failed.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    redirect("/intelligence?error=Campaign%20Planner%20could%20not%20complete%20the%20plan");
  }

  revalidatePath("/");
  revalidatePath("/intelligence");
  revalidatePath("/campaigns");
  revalidatePath("/approvals");
  redirect("/campaigns?planned=1");
}

export async function approveCampaignActivation(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();
  const approvalId = String(formData.get("approvalId") ?? "");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,owner_id,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .eq("action_type", "activate_campaign")
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Campaign%20approval%20is%20not%20available");
  }

  const payload = approval.payload as { campaign_id?: string };
  if (!payload.campaign_id) {
    redirect("/approvals?error=Campaign%20approval%20payload%20is%20invalid");
  }

  const { data: campaign } = await supabase
    .from("genesis_campaigns")
    .select("id,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", payload.campaign_id)
    .single();

  if (!campaign) {
    redirect("/approvals?error=Campaign%20record%20is%20unavailable");
  }

  const metadata =
    campaign.metadata && typeof campaign.metadata === "object"
      ? campaign.metadata
      : {};

  await Promise.all([
    supabase
      .from("genesis_approvals")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolution_note:
          "Campaign activation approved. External execution remains blocked until a channel connector is configured.",
      })
      .eq("id", approval.id),
    supabase
      .from("genesis_campaigns")
      .update({
        metadata: {
          ...metadata,
          activation_approved: true,
          activation_approved_at: new Date().toISOString(),
          execution_status: "awaiting_connector",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id),
    supabase.from("genesis_events").insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      event_type: "campaign.activation_approved",
      source_system: "genesis",
      entity_type: "campaign",
      entity_id: campaign.id,
      idempotency_key: `campaign-activation-approved:${approval.id}`,
      payload: {
        approval_id: approval.id,
        execution_status: "awaiting_connector",
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/campaigns");
  revalidatePath("/approvals");
  redirect("/approvals?decision=campaign-approved");
}

export async function rejectCampaignActivation(formData: FormData) {
  const { supabase, ownerId, workspaceId } = await requireGenesisContext();
  const approvalId = String(formData.get("approvalId") ?? "");

  const { data: approval } = await supabase
    .from("genesis_approvals")
    .select("id,owner_id,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .eq("action_type", "activate_campaign")
    .eq("status", "pending")
    .single();

  if (!approval || approval.owner_id !== ownerId) {
    redirect("/approvals?error=Campaign%20approval%20is%20not%20available");
  }

  const payload = approval.payload as { campaign_id?: string };

  await supabase
    .from("genesis_approvals")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      resolution_note: "Campaign returned to planning for revision.",
    })
    .eq("id", approval.id);

  if (payload.campaign_id) {
    await supabase
      .from("genesis_campaigns")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", payload.campaign_id);
  }

  revalidatePath("/");
  revalidatePath("/campaigns");
  revalidatePath("/approvals");
  redirect("/approvals?decision=campaign-rejected");
}
