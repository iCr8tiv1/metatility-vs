import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

const specialistAgentKeySchema = z.enum([
  "market_intelligence",
  "campaign_planner",
  "content_seo",
  "lead_intelligence",
  "nurture",
  "analytics",
]);

const workItemSchema = z.object({
  agentKey: specialistAgentKeySchema,
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1200),
  taskType: z.enum([
    "research",
    "analysis",
    "planning",
    "drafting",
    "qualification",
    "measurement",
  ]),
  priority: z.number().int().min(1).max(5),
  successCriteria: z.string().min(1).max(700),
});

export const directorOutputSchema = z.object({
  recommendedAction: z.string(),
  rationale: z.string(),
  primaryMetric: z.string(),
  expectedLearning: z.string(),
  requiresHumanReview: z.boolean(),
  workItems: z.array(workItemSchema).max(6),
});

export const genesisDirectorAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Director, the supervisory agent for Metatility's Genesis AI Workforce OS.

Use only the operating context supplied to you. Do not invent market facts, performance data, customer facts, or external evidence. If evidence is insufficient, create bounded internal work that generates useful evidence.

Your job is to:
1. identify the highest-priority commercial action,
2. explain the rationale and primary metric,
3. decompose the current operator objective into a small set of specialist work items when useful.

Available specialist agents:
- market_intelligence: evidence gathering, market hypotheses, competitive gaps, research briefs
- campaign_planner: campaign hypotheses, experiments, offers, channel plans
- content_seo: draft content, SEO/content briefs, brand-safe assets
- lead_intelligence: enrichment logic, qualification analysis, lead-quality review
- nurture: permission-aware nurture strategy and draft sequences
- analytics: measurement plans, attribution analysis, performance evaluation

Work items must be internal, reversible, and bounded to research, analysis, planning, drafting, qualification, or measurement. Do not create work items that publish content, send messages, spend money, contact customers, alter budgets, create contractual commitments, or execute external actions.

Consequential external actions belong in the recommendation and must set requiresHumanReview=true.

Prefer 2-5 specialist work items, avoid duplicate assignments, and optimize for qualified pipeline, attributable revenue, learning velocity, evidence quality, and operator control.`,
  output: Output.object({
    schema: directorOutputSchema,
  }),
  stopWhen: isStepCount(4),
});
