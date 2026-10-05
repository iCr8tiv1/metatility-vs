import { ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export const marketIntelligenceSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  marketHypotheses: z.array(
    z.object({
      hypothesis: z.string(),
      rationale: z.string(),
      evidenceStatus: z.enum(["hypothesis", "internal_signal"]),
      confidence: z.number().min(0).max(1),
    })
  ).min(1).max(6),
  demandSignals: z.array(
    z.object({
      signal: z.string(),
      implication: z.string(),
      evidenceStatus: z.enum(["hypothesis", "internal_signal"]),
      confidence: z.number().min(0).max(1),
    })
  ).max(6),
  competitorHypotheses: z.array(z.string()).max(6),
  channelHypotheses: z.array(
    z.object({
      channel: z.enum([
        "organic_search",
        "paid_search",
        "social",
        "email",
        "referral",
        "content",
      ]),
      rationale: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ).min(1).max(6),
  evidenceGaps: z.array(z.string()).min(1).max(8),
  audiences: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      traits: z.array(z.string()).max(8),
      problems: z.array(z.string()).max(8),
      intents: z.array(z.string()).max(8),
      objections: z.array(z.string()).max(8),
      triggers: z.array(z.string()).max(8),
      exclusions: z.array(z.string()).max(8),
      confidence: z.number().min(0).max(1),
    })
  ).min(1).max(4),
});

export type MarketIntelligenceOutput = z.infer<typeof marketIntelligenceSchema>;

export const marketIntelligenceAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Market Intelligence, a governed marketing intelligence agent inside Metatility's Genesis AI Marketing Operating System.

Your job is to turn a business objective, geography, service lines, and available internal operating context into a disciplined market hypothesis brief.

Critical rules:
- Do not claim you performed live web research or accessed external facts unless the prompt explicitly supplies such evidence.
- In hypothesis mode, treat market conditions, competitor behavior, customer behavior, channel effectiveness, and demand signals as hypotheses to test.
- Distinguish supplied internal signals from unsupported assumptions.
- Do not fabricate statistics, competitor names, market sizes, search volumes, pricing, demographics, or conversion benchmarks.
- Prefer falsifiable hypotheses and explicit evidence gaps.
- Produce 1-4 practical audience hypotheses suitable for campaign testing.
- Optimize for qualified pipeline and attributable revenue, not vanity metrics.
- Do not publish, spend money, or contact customers.`,
  output: Output.object({\n    schema: marketIntelligenceSchema,\n  }),
  stopWhen: isStepCount(4),
});
