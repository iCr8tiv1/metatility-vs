"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWorkforceSpecialistAgent } from "@/lib/agents/workforce-specialist";
import { createClient } from "@/lib/supabase/server";

const WORKFORCE_MODEL = "openai/gpt-5.6-sol";

async function requireGenesisRuntimeContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) redirect("/work?runtime=workspace-error");

  return { supabase, ownerId, workspaceId: workspace.id };
}

export async function runNextWorkforceTask() {
  const { supabase, ownerId, workspaceId } =
    await requireGenesisRuntimeContext();

  const { data: task } = await supabase
    .from("genesis_tasks")
    .select(
      "id,plan_id,objective_id,primary_agent_id,title,description,task_type,status,priority,input,context,created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .not("primary_agent_id", "is", null)
    .order("priority")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!task?.primary_agent_id) {
    redirect("/work?runtime=no-ready-work");
  }

  const { data: agent } = await supabase
    .from("genesis_agents")
    .select("id,agent_key,name,role,status,autonomy_level")
    .eq("workspace_id", workspaceId)
    .eq("id", task.primary_agent_id)
    .single();

  if (!agent || agent.status !== "active") {
    await supabase
      .from("genesis_tasks")
      .update({
        status: "blocked",
        last_error: "Assigned agent is paused or unavailable.",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", task.id)
      .eq("status", "ready");

    redirect("/work?runtime=agent-unavailable");
  }

  const startedAt = new Date().toISOString();

  const { data: claimedTask } = await supabase
    .from("genesis_tasks")
    .update({
      status: "running",
      progress: 10,
      started_at: startedAt,
      last_error: null,
      updated_at: startedAt,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", task.id)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();

  if (!claimedTask) {
    redirect("/work?runtime=claim-conflict");
  }

  await supabase
    .from("genesis_task_assignments")
    .update({
      status: "working",
    })
    .eq("workspace_id", workspaceId)
    .eq("task_id", task.id)
    .eq("agent_id", agent.id);

  const [
    { data: objective },
    { data: plan },
    { data: agentMemory },
    { data: workspaceMemory },
    { data: integrations },
  ] = await Promise.all([
    task.objective_id
      ? supabase
          .from("genesis_objectives")
          .select("id,title,objective,metrics,status")
          .eq("workspace_id", workspaceId)
          .eq("id", task.objective_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    task.plan_id
      ? supabase
          .from("genesis_plans")
          .select("id,title,summary,status,strategy,success_metrics,constraints")
          .eq("workspace_id", workspaceId)
          .eq("id", task.plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("genesis_agent_memory")
      .select(
        "id,memory_type,subject,content,confidence,importance,valid_from,valid_until",
      )
      .eq("workspace_id", workspaceId)
      .eq("agent_id", agent.id)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("genesis_agent_memory")
      .select(
        "id,memory_type,subject,content,confidence,importance,valid_from,valid_until",
      )
      .eq("workspace_id", workspaceId)
      .is("agent_id", null)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("genesis_integrations")
      .select("integration_key,display_name,status,capabilities")
      .eq("workspace_id", workspaceId)
      .order("display_name"),
  ]);

  const executionContext = {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      taskType: task.task_type,
      priority: task.priority,
      input: task.input,
      context: task.context,
    },
    agent: {
      key: agent.agent_key,
      name: agent.name,
      role: agent.role,
      autonomyLevel: agent.autonomy_level,
    },
    objective,
    plan,
    memory: {
      agent: agentMemory ?? [],
      workspace: workspaceMemory ?? [],
    },
    integrations: integrations ?? [],
    executionBoundary: {
      mode: "internal_work_only",
      externalActionsAllowed: false,
      publishingAllowed: false,
      customerContactAllowed: false,
      paidSpendAllowed: false,
      materialBudgetChangeAllowed: false,
    },
  };

  const { data: run, error: runError } = await supabase
    .from("genesis_agent_runs")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      agent_id: agent.id,
      objective_id: task.objective_id ?? null,
      status: "running",
      input: {
        task_id: task.id,
        runtime: "workforce_v0.2",
        context: executionContext,
      },
      provider: "vercel-ai-gateway",
      model: WORKFORCE_MODEL,
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (runError || !run) {
    await supabase
      .from("genesis_tasks")
      .update({
        status: "failed",
        progress: 0,
        last_error: "Agent run could not be created.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    redirect("/work?runtime=run-create-error");
  }

  try {
    const specialist = createWorkforceSpecialistAgent(agent.agent_key);
    const result = await specialist.generate({
      prompt: JSON.stringify(executionContext),
    });

    if (!result.output) {
      throw new Error("Specialist agent returned no structured output.");
    }

    const output = result.output;
    const completedAt = new Date().toISOString();

    await supabase
      .from("genesis_agent_runs")
      .update({
        status: "completed",
        output: {
          task_id: task.id,
          ...output,
        },
        usage: result.usage,
        completed_at: completedAt,
      })
      .eq("id", run.id);

    await supabase
      .from("genesis_tasks")
      .update({
        status: "completed",
        progress: 100,
        output: {
          agent_run_id: run.id,
          specialist_agent_key: agent.agent_key,
          specialist_agent_name: agent.name,
          ...output,
        },
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", task.id);

    await supabase
      .from("genesis_task_assignments")
      .update({
        status: "completed",
        completed_at: completedAt,
      })
      .eq("workspace_id", workspaceId)
      .eq("task_id", task.id)
      .eq("agent_id", agent.id);

    if (output.memoryCandidates.length) {
      await supabase.from("genesis_agent_memory").insert(
        output.memoryCandidates.map((memory) => ({
          workspace_id: workspaceId,
          owner_id: ownerId,
          agent_id: agent.id,
          memory_scope: "agent",
          scope_ref_id: task.id,
          memory_type: memory.memoryType,
          subject: memory.subject,
          content: memory.content,
          confidence: memory.confidence,
          importance: memory.importance,
          source_type: "agent_task",
          source_ref: task.id,
        })),
      );
    }

    if (output.requiresHumanReview) {
      await supabase.from("genesis_recommendations").insert({
        workspace_id: workspaceId,
        owner_id: ownerId,
        agent_id: agent.id,
        objective_id: task.objective_id ?? null,
        title: `${agent.name}: review next action`,
        summary: output.recommendedNextAction,
        rationale: output.summary,
        expected_impact: {
          confidence: output.confidence,
          evidence_gaps: output.evidenceGaps,
          task_id: task.id,
        },
        status: "open",
        priority: task.priority,
        action: {
          mode: "review_work_result",
          task_id: task.id,
          requires_human_review: true,
        },
      });
    }

    await supabase.from("genesis_events").insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      event_type: "task.completed",
      source_system: "genesis_workforce_runtime",
      entity_type: "task",
      entity_id: task.id,
      idempotency_key: `task-completed:${task.id}`,
      payload: {
        agent_id: agent.id,
        agent_key: agent.agent_key,
        agent_run_id: run.id,
        confidence: output.confidence,
        deliverable_count: output.deliverables.length,
        requires_human_review: output.requiresHumanReview,
      },
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Specialist execution failed.";

    await Promise.all([
      supabase
        .from("genesis_agent_runs")
        .update({
          status: "failed",
          error: message,
          completed_at: completedAt,
        })
        .eq("id", run.id),
      supabase
        .from("genesis_tasks")
        .update({
          status: "failed",
          progress: 0,
          last_error: message,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", task.id),
      supabase
        .from("genesis_task_assignments")
        .update({
          status: "assigned",
        })
        .eq("workspace_id", workspaceId)
        .eq("task_id", task.id)
        .eq("agent_id", agent.id),
    ]);

    revalidatePath("/");
    revalidatePath("/work");
    redirect("/work?runtime=execution-error");
  }

  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/analytics");
  redirect(`/work?runtime=completed&task=${task.id}`);
}
