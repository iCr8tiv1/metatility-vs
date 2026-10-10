"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 84
    ? `${normalized.slice(0, 81).trimEnd()}...`
    : normalized;
}

export async function assignGenesisWork(formData: FormData) {
  const objectiveText = String(formData.get("objective") ?? "").trim().slice(0, 2400);

  if (!objectiveText) redirect("/?work=empty");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (!ownerId) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) redirect("/?work=workspace-error");

  const { data: director } = await supabase
    .from("genesis_agents")
    .select("id,autonomy_level,status")
    .eq("workspace_id", workspace.id)
    .eq("agent_key", "director")
    .single();

  if (!director || director.status !== "active") {
    redirect("/?work=director-unavailable");
  }

  const title = compactTitle(objectiveText);

  const { data: objective, error: objectiveError } = await supabase
    .from("genesis_objectives")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      title,
      objective: objectiveText,
      status: "active",
      metrics: {
        source: "operator_command",
        submitted_from: "command_center",
      },
    })
    .select("id")
    .single();

  if (objectiveError || !objective) redirect("/?work=objective-error");

  const { data: plan, error: planError } = await supabase
    .from("genesis_plans")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      objective_id: objective.id,
      director_agent_id: director.id,
      title: `Director plan: ${title}`,
      summary: objectiveText,
      status: "proposed",
      strategy: {
        mode: "director_decomposition",
        source: "operator_command",
      },
      success_metrics: [],
      constraints: {
        consequential_actions_require_approval: true,
      },
    })
    .select("id")
    .single();

  if (planError || !plan) {
    await supabase
      .from("genesis_objectives")
      .update({ status: "cancelled" })
      .eq("id", objective.id);
    redirect("/?work=plan-error");
  }

  const { data: task, error: taskError } = await supabase
    .from("genesis_tasks")
    .insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      plan_id: plan.id,
      objective_id: objective.id,
      primary_agent_id: director.id,
      title: "Interpret operator objective and coordinate the workforce",
      description: objectiveText,
      task_type: "strategy",
      status: "ready",
      priority: 2,
      autonomy_level: Math.min(Number(director.autonomy_level ?? 2), 3),
      requires_approval: false,
      input: {
        operator_command: objectiveText,
      },
      context: {
        source: "command_center",
        role: "workforce_orchestration",
      },
    })
    .select("id")
    .single();

  if (taskError || !task) redirect("/?work=task-error");

  await Promise.all([
    supabase.from("genesis_task_assignments").insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      task_id: task.id,
      agent_id: director.id,
      assignment_role: "owner",
      status: "assigned",
    }),
    supabase.from("genesis_events").insert({
      workspace_id: workspace.id,
      owner_id: ownerId,
      event_type: "objective.created",
      source_system: "genesis_command_center",
      entity_type: "objective",
      entity_id: objective.id,
      idempotency_key: `operator-objective:${objective.id}`,
      payload: {
        objective_id: objective.id,
        plan_id: plan.id,
        task_id: task.id,
        assigned_agent_id: director.id,
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/work");
  redirect("/?work=queued");
}
