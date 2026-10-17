import { z } from "zod";

// BSPP v1 hard limits. Database contracts may tighten these, never expand them.
export const FOUNDATION_MODEL = "openai/gpt-5.6-sol";
export const FOUNDATION_PROVIDER = "vercel-ai-gateway";
export const FOUNDATION_LIMITS = {
  maxInputChars: 60_000,
  maxOutputTokens: 8_000,
  maxRuntimeSeconds: 240,
  maxOutputChars: 60_000,
} as const;

export const specialistAgentKeys = ["market_intelligence", "campaign_planner", "content_seo", "lead_intelligence", "nurture", "analytics"] as const;
export const commandSchema = z.object({ objective: z.string().trim().min(1).max(2400), idempotencyKey: z.uuid() });
export type CommandFormState = { objective: string; idempotencyKey: string; code?: string };
export const taskIdSchema = z.uuid();
export const reviewSchema = z.object({
  taskId: z.uuid(), runId: z.uuid(), decision: z.enum(["accepted", "revision_requested"]), reviewNote: z.string().trim().max(2400),
}).superRefine((review, ctx) => {
  if (review.decision === "revision_requested" && !review.reviewNote) {
    ctx.addIssue({ code: "custom", path: ["reviewNote"], message: "Explain what needs to change." });
  }
});

export const directorWorkItemSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
  dependsOn: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/)).max(6),
  agentKey: z.enum(specialistAgentKeys),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1200),
  taskType: z.enum(["research", "analysis", "planning", "drafting", "qualification", "measurement"]),
  priority: z.number().int().min(1).max(5),
  successCriteria: z.string().trim().min(1).max(700),
});
export const directorOutputSchema = z.object({
  recommendedAction: z.string().trim().min(1).max(1800),
  rationale: z.string().trim().min(1).max(2400),
  primaryMetric: z.string().trim().min(1).max(700),
  expectedLearning: z.string().trim().min(1).max(900),
  requiresHumanReview: z.boolean(),
  workItems: z.array(directorWorkItemSchema).min(1).max(6),
}).superRefine((output, ctx) => {
  const previousKeys = new Set<string>();
  output.workItems.forEach((item, index) => {
    if (previousKeys.has(item.key)) ctx.addIssue({ code: "custom", path: ["workItems", index, "key"], message: "Work item keys must be unique." });
    if (new Set(item.dependsOn).size !== item.dependsOn.length || item.dependsOn.some((key) => !previousKeys.has(key))) {
      ctx.addIssue({ code: "custom", path: ["workItems", index, "dependsOn"], message: "Dependencies must reference distinct, earlier work items." });
    }
    previousKeys.add(item.key);
  });
});

export const specialistTaskResultSchema = z.object({
  summary: z.string().trim().min(1).max(1800),
  confidence: z.number().min(0).max(1),
  findings: z.array(z.object({
    finding: z.string().trim().min(1).max(700),
    evidenceStatus: z.enum(["supplied_context", "internal_inference", "hypothesis"]),
    evidence: z.string().trim().min(1).max(900),
    implication: z.string().trim().min(1).max(700),
  })).max(8),
  deliverables: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    type: z.enum(["brief", "analysis", "plan", "draft", "qualification", "measurement"]),
    content: z.string().trim().min(1).max(5000),
  })).min(1).max(6),
  evidenceGaps: z.array(z.string().trim().min(1).max(500)).max(8),
  recommendedNextAction: z.string().trim().min(1).max(900),
  requiresHumanReview: z.boolean(),
  memoryCandidates: z.array(z.object({
    memoryType: z.enum(["fact", "preference", "decision", "lesson", "pattern", "summary"]),
    subject: z.string().trim().min(1).max(180),
    content: z.string().trim().min(1).max(1800),
    confidence: z.number().min(0).max(1),
    importance: z.number().int().min(1).max(5),
  })).max(6),
});
export type DirectorOutput = z.infer<typeof directorOutputSchema>;
export type SpecialistTaskResult = z.infer<typeof specialistTaskResultSchema>;

export const foundationMessages: Record<string, string> = {
  queued: "Objective saved. Run its Director task to propose a plan.",
  replayed: "This command was already saved. The existing work package was kept.",
  "awaiting-review": "Output saved for review. Review it before accepting the work or releasing dependencies.",
  accepted: "Output accepted. Eligible dependent work can now run.",
  "revision-requested": "Revision requested. The prior output and review remain in the run history.",
  requeued: "Work requeued. A new attempt will preserve the earlier run.",
  cancelled: "Work cancelled. Unfinished dependent work has been stopped.",
  recovered: "Expired runs checked. Interrupted work is available for recovery in the queue.",
  authorized: "Execution authorization recorded for this task and operating contract.",
  rejected: "Execution authorization rejected.",
  "plan-resumed": "The plan resumed with its remaining work. Cancelled assignments remain excluded.",
  "invalid-command": "Enter an objective of up to 2,400 characters and submit it again.",
  "invalid-task": "The selected task is invalid. Refresh the queue and try again.",
  "invalid-review": "Refresh the result before reviewing it. A revision also needs a note describing what should change.",
  "workspace-error": "Genesis could not load your workspace. Check the database connection and workspace access.",
  "foundation-unavailable": "The foundation could not be reached. Check its connection and migration status before retrying.",
  "not-eligible": "This task is no longer eligible to run. Refresh the queue for its current status and prerequisites.",
  "contract-error": "The operating contract is missing, unsupported, or exceeds the runtime limits. Execution was stopped.",
  "generation-failed": "The model run failed. The failure was recorded; inspect the task before retrying.",
  "output-invalid": "The model output did not satisfy the operating contract. No output was accepted.",
  "persistence-failed": "The output could not be confirmed as saved. Refresh and inspect the run before retrying.",
  "recovery-required": "The run could not be finalized. Inspect its current state; expired work can be recovered safely.",
  "transition-failed": "This change could not be confirmed. Refresh the task; its state or review version may have changed.",
  "context-too-large": "The supplied context exceeds this contract's input limit. Reduce or split the objective.",
};
export const foundationSuccessCodes = new Set(["queued", "replayed", "awaiting-review", "accepted", "revision-requested", "requeued", "cancelled", "recovered", "authorized", "rejected", "plan-resumed"]);
