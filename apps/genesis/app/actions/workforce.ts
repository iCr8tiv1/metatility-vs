"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviewSchema, taskIdSchema } from "@/lib/genesis/foundation-contract";
import { executeFoundationWork } from "@/lib/genesis/runtime";
import { createFoundationRunStore, foundationGenerator, foundationRpc } from "@/lib/genesis/runtime-server";
import { requireFoundationContext } from "@/lib/genesis/workspace";

function refreshFoundation() {
  revalidatePath("/"); revalidatePath("/work"); revalidatePath("/foundation");
}
function taskIdFrom(formData: FormData) {
  const result = taskIdSchema.safeParse(formData.get("taskId"));
  if (!result.success) redirect("/work?runtime=invalid-task");
  return result.data;
}
async function runSpecialist(taskId?: string) {
  const { supabase, workspace } = await requireFoundationContext();
  const outcome = await executeFoundationWork(createFoundationRunStore(supabase, workspace.id), foundationGenerator, "specialist", taskId);
  refreshFoundation();
  const params = new URLSearchParams({ runtime: outcome.code });
  if (outcome.taskId) params.set("task", outcome.taskId);
  redirect(`/work?${params}`);
}
export async function runNextWorkforceTask() { await runSpecialist(); }
export async function runWorkforceTask(formData: FormData) { await runSpecialist(taskIdFrom(formData)); }

async function transition(name: string, args: Record<string, unknown>, successCode: string, taskId?: string) {
  const { supabase, workspace } = await requireFoundationContext();
  let code = successCode;
  try { await foundationRpc(supabase, name, { p_workspace_id: workspace.id, ...args }); }
  catch { code = "transition-failed"; }
  refreshFoundation();
  const params = new URLSearchParams({ runtime: code });
  if (taskId) params.set("task", taskId);
  redirect(`/work?${params}`);
}
export async function retryFailedWorkforceTask(formData: FormData) {
  const taskId = taskIdFrom(formData);
  await transition("genesis_retry_work", { p_task_id: taskId }, "requeued", taskId);
}
export async function cancelWorkforceTask(formData: FormData) {
  const taskId = taskIdFrom(formData);
  await transition("genesis_cancel_work", { p_task_id: taskId }, "cancelled", taskId);
}
export async function reviewWorkforceTask(formData: FormData) {
  const input = reviewSchema.safeParse({ taskId: formData.get("taskId"), runId: formData.get("runId"), decision: formData.get("decision"), reviewNote: formData.get("reviewNote") ?? "" });
  if (!input.success) redirect("/work?runtime=invalid-review");
  const review = input.data;
  await transition("genesis_review_work", {
    p_task_id: review.taskId, p_run_id: review.runId,
    p_decision: review.decision === "accepted" ? "accept" : "revise", p_notes: review.reviewNote,
  }, review.decision === "accepted" ? "accepted" : "revision-requested", review.taskId);
}
export async function recoverStaleWorkforceTasks() { await transition("genesis_recover_stale_work", {}, "recovered"); }
export async function resumeGenesisPlan(formData: FormData) {
  const planId = taskIdSchema.safeParse(formData.get("planId"));
  if (!planId.success) redirect("/work?runtime=invalid-task");
  await transition("genesis_resume_plan", { p_plan_id: planId.data }, "plan-resumed");
}
export async function authorizeWorkforceTask(formData: FormData) {
  const taskId = taskIdFrom(formData);
  const decision = formData.get("decision");
  const notes = String(formData.get("reviewNote") ?? "").trim();
  if (!["approve", "reject"].includes(String(decision)) || notes.length > 2400) redirect("/work?runtime=invalid-review");
  await transition("genesis_authorize_work", { p_task_id: taskId, p_decision: decision, p_notes: notes }, decision === "approve" ? "authorized" : "rejected", taskId);
}
