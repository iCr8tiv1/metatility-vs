import { z } from "zod";
import { directorOutputSchema, FOUNDATION_LIMITS, specialistTaskResultSchema, specialistAgentKeys } from "./foundation-contract";

export type RuntimeKind = "director" | "specialist";
const contractSchema = z.object({
  id: z.uuid(),
  contract_key: z.literal("genesis-foundation"),
  version: z.literal(1),
  specification: z.object({
    executionMode: z.literal("internal_only"),
    resultReviewRequired: z.literal(true),
    permissions: z.object({ externalActions: z.literal(false), publishing: z.literal(false), customerContact: z.literal(false), spending: z.literal(false), credentialAccess: z.literal(false) }),
    max_input_chars: z.number().int().min(1).max(FOUNDATION_LIMITS.maxInputChars),
    max_output_tokens: z.number().int().min(1).max(FOUNDATION_LIMITS.maxOutputTokens),
    max_runtime_seconds: z.number().int().min(1).max(FOUNDATION_LIMITS.maxRuntimeSeconds),
  }).passthrough(),
}).passthrough();

export const claimedWorkSchema = z.object({
  task: z.object({ id: z.uuid(), workspace_id: z.uuid(), status: z.literal("running") }).passthrough(),
  agent: z.object({ id: z.uuid(), agent_key: z.enum(["director", ...specialistAgentKeys]) }).passthrough(),
  run_id: z.uuid(),
  attempt: z.number().int().positive(),
  contract: contractSchema,
  context: z.record(z.string(), z.unknown()),
  lease_expires_at: z.string(),
});
export type ClaimedWork = z.infer<typeof claimedWorkSchema>;

export interface FoundationRunStore {
  claim(kind: RuntimeKind, taskId?: string): Promise<unknown>;
  complete(kind: RuntimeKind, runId: string, output: unknown, usage: Record<string, unknown>): Promise<void>;
  fail(runId: string, error: string): Promise<void>;
}
export interface FoundationGenerator {
  generate(kind: RuntimeKind, work: ClaimedWork, prompt: string): Promise<{ output: unknown; usage: Record<string, unknown> }>;
}
export type RuntimeOutcome = { code: string; taskId?: string; runId?: string };

export class FoundationStoreError extends Error {
  constructor(readonly databaseCode: string) { super(`Foundation database rejected the request (${databaseCode}).`); }
}

class ContractFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Orchestrates one bounded attempt. Database transactions own every state change. */
export async function executeFoundationWork(
  store: FoundationRunStore, generator: FoundationGenerator, kind: RuntimeKind, taskId?: string,
): Promise<RuntimeOutcome> {
  let raw: unknown;
  try { raw = await store.claim(kind, taskId); }
  catch { return { code: "foundation-unavailable", taskId }; }
  if (!raw) return { code: "not-eligible", taskId };

  // Retain only validated IDs if a newer/invalid contract is returned, so an
  // already-claimed attempt can still be failed without trusting its payload.
  const identity = z.object({ run_id: z.uuid(), task: z.object({ id: z.uuid() }) }).safeParse(raw);
  if (!identity.success) return { code: "recovery-required", taskId };
  const runId = identity.data.run_id;
  const selectedTaskId = identity.data.task.id;
  let completionStarted = false;
  try {
    const parsed = claimedWorkSchema.safeParse(raw);
    if (!parsed.success) throw new ContractFailure("contract-error");
    const work = parsed.data;
    if ((kind === "director") !== (work.agent.agent_key === "director")) throw new ContractFailure("contract-error");
    const prompt = JSON.stringify(work.context);
    if (prompt.length > work.contract.specification.max_input_chars) throw new ContractFailure("context-too-large");

    const result = await generator.generate(kind, work, prompt);
    const output = kind === "director" ? directorOutputSchema.safeParse(result.output) : specialistTaskResultSchema.safeParse(result.output);
    if (!output.success || JSON.stringify(output.data).length > FOUNDATION_LIMITS.maxOutputChars) throw new ContractFailure("output-invalid");
    if (kind === "director") {
      const workforce = z.array(z.object({ agent_key: z.string() }).passthrough()).safeParse(work.context.workforce);
      if (!workforce.success) throw new ContractFailure("contract-error");
      const available = new Set(workforce.data.map((agent) => agent.agent_key));
      if (directorOutputSchema.parse(output.data).workItems.some((item) => !available.has(item.agentKey))) throw new ContractFailure("output-invalid");
    }

    // A network error here is ambiguous: the transaction may have committed.
    // Never issue a failure write that could overwrite a successfully stored result.
    completionStarted = true;
    await store.complete(kind, runId, output.data, result.usage);
    return { code: "awaiting-review", taskId: selectedTaskId, runId };
  } catch (error) {
    const rejectedOutput = completionStarted && error instanceof FoundationStoreError && error.databaseCode === "22023";
    if (completionStarted && !rejectedOutput) return { code: "persistence-failed", taskId: selectedTaskId, runId };
    const code = rejectedOutput ? "output-invalid" : error instanceof ContractFailure ? error.code : "generation-failed";
    try {
      // Do not persist provider response bodies, credentials, or untrusted text.
      await store.fail(runId, `Foundation runtime stopped: ${code}.`);
    } catch {
      return { code: "recovery-required", taskId: selectedTaskId, runId };
    }
    return { code, taskId: selectedTaskId, runId };
  }
}
