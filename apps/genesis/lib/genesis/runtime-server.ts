import type { SupabaseClient } from "@supabase/supabase-js";
import { createGenesisDirectorAgent } from "@/lib/agents/director";
import { createWorkforceSpecialistAgent } from "@/lib/agents/workforce-specialist";
import { FOUNDATION_MODEL, FOUNDATION_PROVIDER } from "./foundation-contract";
import type { FoundationGenerator, FoundationRunStore } from "./runtime";
import { FoundationStoreError } from "./runtime";

export async function foundationRpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new FoundationStoreError(error.code ?? "unknown");
  return data as unknown;
}

export function createFoundationRunStore(supabase: SupabaseClient, workspaceId: string): FoundationRunStore {
  const invoke = (name: string, args: Record<string, unknown>) => foundationRpc(supabase, name, { p_workspace_id: workspaceId, ...args });
  return {
    claim: (kind, taskId) => invoke("genesis_claim_work", { p_kind: kind, p_model: FOUNDATION_MODEL, p_provider: FOUNDATION_PROVIDER, p_task_id: taskId ?? null }),
    async complete(kind, runId, output, usage) {
      await invoke(kind === "director" ? "genesis_complete_director" : "genesis_complete_work", { p_run_id: runId, p_output: output, p_usage: usage });
    },
    async fail(runId, error) { await invoke("genesis_fail_work", { p_run_id: runId, p_error: error }); },
  };
}

export const foundationGenerator: FoundationGenerator = {
  async generate(kind, work, prompt) {
    const spec = work.contract.specification;
    const options = { prompt, timeout: { totalMs: spec.max_runtime_seconds * 1000 } };
    const result = kind === "director"
      ? await createGenesisDirectorAgent(spec.max_output_tokens).generate(options)
      : await createWorkforceSpecialistAgent(work.agent.agent_key, spec.max_output_tokens).generate(options);
    // SDK totalUsage aggregates reported usage across steps. Missing fields stay
    // missing; the UI must never infer a zero monetary cost from token counts.
    const usage = JSON.parse(JSON.stringify(result.totalUsage)) as Record<string, unknown>;
    return { output: result.output, usage };
  },
};
