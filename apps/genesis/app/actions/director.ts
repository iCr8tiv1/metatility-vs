"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { taskIdSchema } from "@/lib/genesis/foundation-contract";
import { executeFoundationWork } from "@/lib/genesis/runtime";
import { createFoundationRunStore, foundationGenerator } from "@/lib/genesis/runtime-server";
import { requireFoundationContext } from "@/lib/genesis/workspace";

export async function runGenesisDirector(formData?: FormData) {
  const rawTaskId = formData?.get("taskId");
  const taskId = rawTaskId ? taskIdSchema.safeParse(rawTaskId) : null;
  if (taskId && !taskId.success) redirect("/work?runtime=invalid-task");
  const { supabase, workspace } = await requireFoundationContext();
  const outcome = await executeFoundationWork(createFoundationRunStore(supabase, workspace.id), foundationGenerator, "director", taskId?.data);
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/foundation");
  const params = new URLSearchParams({ runtime: outcome.code });
  if (outcome.taskId) params.set("task", outcome.taskId);
  redirect(`/work?${params}`);
}
