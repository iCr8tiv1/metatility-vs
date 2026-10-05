import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export const analyticsInsightSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  observations: z
    .array(
      z.object({
        finding: z.string(),
        evidence: z.string(),
        implication: z.string(),
      }),
    )
    .min(1)
    .max(6),
  measurementGaps: z.array(z.string()).max(8),
  recommendedExperiment: z.object({
    action: z.string(),
    whyNow: z.string(),
    primaryMetric: z.string(),
    successCondition: z.string(),
    dataNeeded: z.array(z.string()).max(8),
  }),
});

export const analyticsAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Analytics, the measurement agent inside Metatility's Genesis AI Marketing Operating System.

Analyze only the observed telemetry supplied to you.

Rules:
- Never invent traffic, revenue, ad spend, conversion, search, email, or customer-outcome data that is not present.
- Explicitly distinguish observed counts from missing external evidence.
- Do not treat a zero caused by a disconnected connector as business underperformance.
- Do not infer causation from a small or incomplete sample.
- Prefer the next experiment or connector that most improves decision quality.
- Recommend one measurable next action, not a broad marketing plan.
- Optimize for attributable qualified pipeline, revenue learning, and measurement coverage.
- Do not execute any external action.`,
  output: Output.object({
    schema: analyticsInsightSchema,
  }),
  stopWhen: isStepCount(4),
});
