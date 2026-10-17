import type { CommandFormState } from "../../lib/genesis/foundation-contract";

export type HarnessCall = { action: string; fields: Record<string, string> };

declare global {
  interface Window {
    __foundationHarness: { calls: HarnessCall[]; delayMs: number };
    __fixtureInjected?: boolean;
  }
}

async function record(action: string, formData: FormData) {
  const fields = Object.fromEntries([...formData.entries()].map(([key, value]) => [
    key, typeof value === "string" ? value : value.name,
  ]));
  window.__foundationHarness.calls.push({ action, fields });
  await new Promise<void>((resolve) => setTimeout(resolve, window.__foundationHarness.delayMs));
}

// These functions replace server actions only in the standalone browser bundle.
// They never import a Supabase client, mutate a database, or call a provider.
export async function assignGenesisWork(_previous: CommandFormState, formData: FormData): Promise<CommandFormState> {
  await record("assign", formData);
  return {
    objective: String(formData.get("objective") ?? "").trim(),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    code: "foundation-unavailable",
  };
}

export async function runWorkforceTask(formData: FormData) { await record("run-specialist", formData); }
export async function runGenesisDirector(formData: FormData) { await record("run-director", formData); }
export async function retryFailedWorkforceTask(formData: FormData) { await record("retry", formData); }
export async function cancelWorkforceTask(formData: FormData) { await record("cancel", formData); }
export async function authorizeWorkforceTask(formData: FormData) { await record("authorize", formData); }
export async function reviewWorkforceTask(formData: FormData) { await record("review", formData); }
