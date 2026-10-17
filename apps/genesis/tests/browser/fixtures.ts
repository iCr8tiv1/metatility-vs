import type { WorkAgent, WorkTask } from "../../app/work/_components/task-card";
import type { WorkAttempt } from "../../app/work/_components/attempt-history";

export const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  run: "33333333-3333-4333-8333-333333333333",
  previousRun: "44444444-4444-4444-8444-444444444444",
  agent: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  workspace: "77777777-7777-4777-8777-777777777777",
};

export const injectionText = '<img src="x" onerror="window.__fixtureInjected=true"> <script>window.__fixtureInjected=true</script>';

export const specialistOutput = {
  summary: "A neutral verification checklist is ready for review.",
  confidence: 0.8,
  findings: [{
    finding: "The synthetic workflow has no deployment evidence.",
    evidenceStatus: "supplied_context",
    evidence: "Only a neutral fixture was supplied.",
    implication: "Verify the deployment separately before claiming an end-to-end result.",
  }],
  deliverables: [{
    title: "Verification checklist",
    type: "measurement",
    content: `1. Record the expected state.\n2. Execute one bounded action.\n3. Compare the observed result.\nLiteral untrusted input: ${injectionText}`,
  }],
  evidenceGaps: ["Live authentication and production database access are unverified."],
  recommendedNextAction: "Review the checklist and collect actual execution evidence.",
  requiresHumanReview: false,
  memoryCandidates: [],
};

export const directorOutput = {
  recommendedAction: "Prepare and review two neutral verification artifacts.",
  rationale: "Keep generation separate from accepted evidence.",
  primaryMetric: "Artifacts with an explicit review decision",
  expectedLearning: "Which expected outcomes have supporting evidence",
  requiresHumanReview: false,
  workItems: [{
    key: "checklist", dependsOn: [], agentKey: "analytics", title: "Draft a verification checklist",
    description: "Use the supplied synthetic workflow only.", taskType: "measurement", priority: 2,
    successCriteria: "Each step has an observable expected result.",
  }, {
    key: "review", dependsOn: ["checklist"], agentKey: "market_intelligence", title: "Review the accepted checklist",
    description: "Identify unsupported claims in the accepted checklist.", taskType: "analysis", priority: 3,
    successCriteria: "Every material claim has an evidence classification.",
  }],
};

export const agent: WorkAgent = { id: ids.agent, agent_key: "analytics", name: "Neutral analyst", status: "active" };
export const director: WorkAgent = { ...agent, agent_key: "director", name: "Genesis Director" };

export function task(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: ids.task, title: "Review a neutral verification checklist", description: "Use synthetic material to inspect component behavior.",
    task_type: "measurement", status: "awaiting_review", priority: 2, progress: 100,
    primary_agent_id: ids.agent, plan_id: ids.plan, requires_approval: false,
    input: { success_criteria: "Keep expected outcomes and observed evidence separate." }, context: {}, output: specialistOutput,
    created_at: "2026-10-17T12:00:00.000Z", completed_at: "2026-10-17T12:05:00.000Z",
    last_error: null, due_at: null, active_run_id: ids.run, attempt_count: 2, accepted_at: null,
    ...overrides,
  };
}

export const attempts: WorkAttempt[] = [{
  run_id: ids.run, task_id: ids.task, attempt_number: 2, status: "produced", output: specialistOutput,
  error: null, started_at: "2026-10-17T12:04:00.000Z", finished_at: "2026-10-17T12:05:00.000Z",
  reviewDecision: null, reviewNote: null,
}, {
  run_id: ids.previousRun, task_id: ids.task, attempt_number: 1, status: "produced",
  output: { ...specialistOutput, summary: "The first synthetic checklist omitted an expected result." },
  error: null, started_at: "2026-10-17T12:00:00.000Z", finished_at: "2026-10-17T12:01:00.000Z",
  reviewDecision: "revise", reviewNote: "Add the missing expected result and preserve the earlier evidence.",
}];
