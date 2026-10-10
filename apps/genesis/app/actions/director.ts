"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { genesisDirectorAgent } from "@/lib/agents/director";

const DIRECTOR_MODEL = "openai/gpt-5.6-sol";

const SPECIALIST_KEYS = [
  "market_intelligence",
  "campaign_planner",
  "content_seo",
  "lead_intelligence",
  "nurture",
  "analytics",
] as const;

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
      .select("id,autonomy_level")
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
    { data: specialists },
    { data: plan },
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
    supabase
      .from("genesis_agents")
      .select("id,agent_key,name,role,status,autonomy_level")
      .eq("workspace_id", workspace.id)
      .eq("status", "active")
      .in("agent_key", SPECIALIST_KEYS),
    objective
      ? supabase
          .from("genesis_plans")
          .select("id,status,strategy")
          .eq("workspace_id", workspace.id)
          .eq("objective_id", objective.id)
          .in("status", ["draft", "proposed", "approved", "active"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const specialistRows = specialists ?? [];
  const availableSpecialists = specialistRows.map((agent) => ({
    agentKey: agent.agent_key,
    name: agent.name,
    role: agent.role,
    autonomyLevel: agent.autonomy_level,
  }));

  const context = {
    objective: objective
      ? {
          title: objective.title,
          objective: objective.objective,
          metrics: objective.metrics,
        }
      : null,
    currentPlan: plan
      ? {
          id: plan.id,
          status: plan.status,
          strategy: plan.strategy,
        }
      : null,
    workforce: availableSpecialists,
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
    governance: {
      externalExecutionRequiresApproval: true,
      allowedWorkTypes: [
        "research",
        "analysis",
        "planning",
        "drafting",
        "qualification",
        "measurement",
      ],
    },
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

  let directorTaskId: string | null = null;

  if (plan) {
    const { data: directorTask } = await supabase
      .from("genesis_tasks")
      .select("id,status")
      .eq("workspace_id", workspace.id)
      .eq("plan_id", plan.id)
      .eq("primary_agent_id", director.id)
      .in("status", ["queued", "ready", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    directorTaskId = directorTask?.id ?? null;

    if (directorTaskId && directorTask?.status !== "running") {
      await supabase
        .from("genesis_tasks")
        .update({
          status: "running",
          progress: 30,
          started_at: new Date().toISOString(),
        })
        .eq("id", directorTaskId);
    }
  }

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
        mode: "recommend_and_coordinate",
        requires_human_review: output.requiresHumanReview,
      },
    });

    let createdTaskCount = 0;

    if (plan && output.workItems.length) {
      const { count: existingSpecialistTaskCount } = await supabase
        .from("genesis_tasks")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .eq("plan_id", plan.id)
        .in(
          "primary_agent_id",
          specialistRows.map((agent) => agent.id)
        );

      if ((existingSpecialistTaskCount ?? 0) === 0) {
        const specialistByKey = new Map(
          specialistRows.map((agent) => [agent.agent_key, agent])
        );

        const taskPayloads = output.workItems.flatMap((item) => {
          const specialist = specialistByKey.get(item.agentKey);
          if (!specialist) return [];

          return [
            {
              workspace_id: workspace.id,
              owner_id: ownerId,
              plan_id: plan.id,
              objective_id: objective?.id ?? null,
              primary_agent_id: specialist.id,
              title: item.title,
              description: item.description,
              task_type: item.taskType,
              status: "ready",
              priority: item.priority,
              autonomy_level: Math.min(
                Number(specialist.autonomy_level ?? 2),
                3
              ),
              requires_approval: false,
              input: {
                objective: objective?.objective ?? null,
                success_criteria: item.successCriteria,
              },
              context: {
                generated_by: "genesis_director",
                director_run_id: run.id,
                specialist_agent_key: item.agentKey,
              },
            },
          ];
        });

        if (taskPayloads.length) {
          const { data: createdTasks, error: taskInsertError } = await supabase
            .from("genesis_tasks")
            .insert(taskPayloads)
            .select("id,primary_agent_id");

          if (taskInsertError) throw taskInsertError;

          createdTaskCount = createdTasks?.length ?? 0;

          if (createdTasks?.length) {
            const assignmentPayloads = createdTasks.map((task) => ({
              workspace_id: workspace.id,
              owner_id: ownerId,
              task_id: task.id,
              agent_id: task.primary_agent_id,
              assignment_role: "owner",
              status: "assigned",
            }));

            const { error: assignmentError } = await supabase
              .from("genesis_task_assignments")
              .insert(assignmentPayloads);

            if (assignmentError) throw assignmentError;
          }

          await supabase
            .from("genesis_plans")
            .update({
              status: "active",
              strategy: {
                ...(typeof plan.strategy === "object" && plan.strategy
                  ? plan.strategy
                  : {}),
                director_run_id: run.id,
                decomposition: "specialist_work_items",
                primary_metric: output.primaryMetric,
                expected_learning: output.expectedLearning,
              },
              success_metrics: [
                {
                  metric: output.primaryMetric,
                  source: "director_decomposition",
                },
              ],
              updated_at: new Date().toISOString(),
            })
            .eq("id", plan.id);

          await supabase.from("genesis_events").insert({
            workspace_id: workspace.id,
            owner_id: ownerId,
            event_type: "plan.decomposed",
            source_system: "genesis_director",
            entity_type: "plan",
            entity_id: plan.id,
            idempotency_key: `plan-decomposed:${plan.id}`,
            payload: {
              objective_id: objective?.id ?? null,
              director_run_id: run.id,
              task_count: createdTaskCount,
              specialist_agent_keys: output.workItems.map(
                (item) => item.agentKey
              ),
            },
          });
        }
      }
    }

    if (directorTaskId) {
      await supabase
        .from("genesis_tasks")
        .update({
          status: "completed",
          progress: 100,
          output: {
            director_run_id: run.id,
            recommended_action: output.recommendedAction,
            specialist_tasks_created: createdTaskCount,
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", directorTaskId);

      await supabase
        .from("genesis_task_assignments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("task_id", directorTaskId)
        .eq("agent_id", director.id);
    }
  } catch (error) {
    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "failed",
        error:
          error instanceof Error ? error.message : "Director execution failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (directorTaskId) {
      await supabase
        .from("genesis_tasks")
        .update({
          status: "failed",
          last_error:
            error instanceof Error ? error.message : "Director execution failed.",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", directorTaskId);
    }

    redirect("/?director=execution-error");
  }

  revalidatePath("/");
  revalidatePath("/work");
  redirect("/?director=complete");
}
