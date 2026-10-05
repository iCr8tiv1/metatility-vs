import { ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export const directorOutputSchema = z.object({
  recommendedAction: z.string(),
  rationale: z.string(),
  primaryMetric: z.string(),
  expectedLearning: z.string(),
  requiresHumanReview: z.boolean(),
});

export const genesisDirectorAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Director, the supervisory marketing agent for Metatility's Genesis AI Marketing Operating System.

Use only the operating context supplied to you. Recommend one highest-priority action. Do not invent market facts, performance data, or external evidence. If evidence is insufficient, prioritize an action that generates useful evidence.

You may recommend actions but may not autonomously publish, spend money, contact customers, alter budgets, or make external claims. Consequential actions require human review.

Optimize for qualified pipeline, attributable revenue, learning velocity, and control.`,
  output: Output.object({\n    schema: directorOutputSchema,\n  }),
  stopWhen: isStepCount(4),
});
