"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { commandSchema, type CommandFormState } from "@/lib/genesis/foundation-contract";
import { foundationRpc } from "@/lib/genesis/runtime-server";
import { requireFoundationContext } from "@/lib/genesis/workspace";

export async function assignGenesisWork(previousState: CommandFormState, formData: FormData): Promise<CommandFormState> {
  const input = commandSchema.safeParse({ objective: formData.get("objective"), idempotencyKey: formData.get("idempotencyKey") });
  if (!input.success) return { ...previousState, objective: String(formData.get("objective") ?? ""), code: "invalid-command" };
  const workspaceId = z.uuid().safeParse(formData.get("workspaceId"));
  if (!workspaceId.success) return { ...input.data, code: "workspace-error" };
  const { supabase, workspace } = await requireFoundationContext(workspaceId.data);
  let saved: { task_id: string; replayed: boolean } | undefined;
  try {
    const result = await foundationRpc(supabase, "genesis_submit_command", {
      p_workspace_id: workspace.id, p_command: input.data.objective, p_idempotency_key: input.data.idempotencyKey,
    });
    saved = z.object({ task_id: z.uuid(), replayed: z.boolean() }).parse(result);
  } catch {
    // Keep the same request key after an ambiguous network response. Retrying
    // the unchanged command reuses its transaction instead of creating work twice.
    return { ...input.data, code: "foundation-unavailable" };
  }
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/foundation");
  redirect(`/work?runtime=${saved.replayed ? "replayed" : "queued"}&task=${saved.task_id}`);
}
