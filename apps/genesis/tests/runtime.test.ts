import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { commandSchema, directorOutputSchema, reviewSchema } from "../lib/genesis/foundation-contract";
import { executeFoundationWork, FoundationStoreError, type FoundationRunStore, type FoundationGenerator } from "../lib/genesis/runtime";

const specialistResult = {
  summary: "The supplied synthetic checklist has three observable steps.", confidence: 0.8,
  findings: [{ finding: "The third step lacks evidence.", evidenceStatus: "supplied_context", evidence: "Fixture input marks evidence as missing.", implication: "Collect evidence before accepting that step." }],
  deliverables: [{ title: "Verification checklist", type: "measurement", content: "1. Record the initial state. 2. Execute the bounded action. 3. Capture its result." }],
  evidenceGaps: ["No actual deployment was supplied."], recommendedNextAction: "Review the checklist.", requiresHumanReview: false,
  memoryCandidates: [{ memoryType: "lesson", subject: "Synthetic checklist", content: "Keep expected and observed results separate.", confidence: 0.8, importance: 2 }],
};
const item = { key: "checklist", dependsOn: [], agentKey: "analytics", title: "Draft a checklist", description: "Use only the synthetic fixture.", taskType: "measurement", priority: 2, successCriteria: "Each step has an expected result." };
const plan = { recommendedAction: "Write a reviewable checklist.", rationale: "This makes evidence visible.", primaryMetric: "Steps with recorded evidence", expectedLearning: "Which steps lack evidence", requiresHumanReview: false, workItems: [item] };
function claim(director = false) {
  return {
    task: { id: randomUUID(), workspace_id: randomUUID(), status: "running" },
    agent: { id: randomUUID(), agent_key: director ? "director" : "analytics" }, run_id: randomUUID(), attempt: 1,
    contract: { id: randomUUID(), contract_key: "genesis-foundation", version: 1, specification: {
      executionMode: "internal_only", resultReviewRequired: true,
      permissions: { externalActions: false, publishing: false, customerContact: false, spending: false, credentialAccess: false },
      max_input_chars: 60000, max_output_tokens: 8000, max_runtime_seconds: 240,
    } },
    context: { objective: "Evaluate a neutral synthetic workflow.", workforce: [{ agent_key: "analytics" }], dependencies: [] },
    lease_expires_at: new Date(Date.now() + 900000).toISOString(),
  };
}
function harness(raw: unknown = claim(), output: unknown = specialistResult) {
  const events: string[] = [];
  let savedOutput: unknown;
  const store: FoundationRunStore = {
    async claim() { events.push("claim"); return raw; },
    async complete(_kind, _run, output) { events.push("complete"); savedOutput = output; },
    async fail() { events.push("fail"); },
  };
  const generator: FoundationGenerator = { async generate() { events.push("generate"); return { output, usage: { inputTokens: 100, outputTokens: 150 } }; } };
  return { events, store, generator, saved: () => savedOutput };
}

test("a generated result stays pending even when the model says no human review", async () => {
  const h = harness();
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "awaiting-review");
  assert.deepEqual(h.events, ["claim", "generate", "complete"]);
  assert.deepEqual((h.saved() as typeof specialistResult).memoryCandidates, specialistResult.memoryCandidates);
});
test("an ineligible task never invokes a model", async () => {
  const h = harness(null);
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "not-eligible");
  assert.deepEqual(h.events, ["claim"]);
});
test("contract escalation is rejected before generation and the attempt is failed", async () => {
  const raw = claim(); raw.contract.specification.permissions.externalActions = true;
  const h = harness(raw);
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "contract-error");
  assert.deepEqual(h.events, ["claim", "fail"]);
});
test("the Director cannot run through a specialist entry point", async () => {
  const h = harness(claim(true));
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "contract-error");
  assert.deepEqual(h.events, ["claim", "fail"]);
});
test("oversized supplied context is not silently truncated or sent", async () => {
  const raw = claim(); raw.context.objective = "x".repeat(60001);
  const h = harness(raw);
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "context-too-large");
  assert.deepEqual(h.events, ["claim", "fail"]);
});
test("malformed nested output is not persisted as successful work", async () => {
  const h = harness(claim(), { ...specialistResult, findings: [null] });
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "output-invalid");
  assert.deepEqual(h.events, ["claim", "generate", "fail"]);
});
test("a provider failure is recorded without storing provider secrets", async () => {
  const h = harness(); let storedError = "";
  h.generator.generate = async () => { throw new Error("sk-secret-provider-body"); };
  h.store.fail = async (_run, error) => { storedError = error; };
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "generation-failed");
  assert.doesNotMatch(storedError, /secret/);
});
test("ambiguous completion failures never overwrite a possibly committed output", async () => {
  const h = harness(); h.store.complete = async () => { h.events.push("commit-then-disconnect"); throw new Error("connection lost"); };
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "persistence-failed");
  assert.deepEqual(h.events, ["claim", "generate", "commit-then-disconnect"]);
});
test("an unavailable failure recorder is surfaced as recovery required", async () => {
  const h = harness(claim(), {}); h.store.fail = async () => { throw new Error("offline"); };
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "recovery-required");
});
test("a definite database contract rejection records failure without waiting for lease recovery", async () => {
  const h = harness(); h.store.complete = async () => { h.events.push("rejected"); throw new FoundationStoreError("22023"); };
  assert.equal((await executeFoundationWork(h.store, h.generator, "specialist")).code, "output-invalid");
  assert.deepEqual(h.events, ["claim", "generate", "rejected", "fail"]);
});
test("Director output can use only the roster frozen in its context", async () => {
  const h = harness(claim(true), { ...plan, workItems: [{ ...item, agentKey: "content_seo" }] });
  assert.equal((await executeFoundationWork(h.store, h.generator, "director")).code, "output-invalid");
  assert.deepEqual(h.events, ["claim", "generate", "fail"]);
});
test("a bounded valid plan persists for review", async () => {
  const h = harness(claim(true), plan);
  assert.equal((await executeFoundationWork(h.store, h.generator, "director")).code, "awaiting-review");
});
test("the plan contract rejects cycles, forward edges, repeated keys and empty work", () => {
  for (const workItems of [[], [{ ...item, dependsOn: ["later"] }], [item, item], [item, { ...item, key: "later", dependsOn: ["checklist", "checklist"] }]]) {
    assert.equal(directorOutputSchema.safeParse({ ...plan, workItems }).success, false);
  }
});
test("commands are bounded and reviews bind an exact result version with revision feedback", () => {
  assert.equal(commandSchema.safeParse({ objective: " ", idempotencyKey: randomUUID() }).success, false);
  assert.equal(commandSchema.safeParse({ objective: "x".repeat(2401), idempotencyKey: randomUUID() }).success, false);
  assert.equal(reviewSchema.safeParse({ taskId: randomUUID(), runId: randomUUID(), decision: "revision_requested", reviewNote: "" }).success, false);
  assert.equal(reviewSchema.safeParse({ taskId: randomUUID(), decision: "accepted", reviewNote: "" }).success, false);
});
