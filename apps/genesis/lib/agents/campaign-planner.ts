import { Output, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";

export const campaignPlanSchema = z.object({
  name: z.string(),
  channel: z.enum([
    "organic_search",
    "paid_search",
    "social",
    "email",
    "referral",
    "content",
  ]),
  hypothesis: z.string(),
  offer: z.string(),
  primaryMetric: z.string(),
  targetValue: z.number().nonnegative().nullable(),
  rationale: z.string(),
  audienceStrategy: z.string(),
  testDesign: z.object({
    testWindow: z.string(),
    successCondition: z.string(),
    failureCondition: z.string(),
    learningGoal: z.string(),
  }),
  assetBriefs: z.array(
    z.object({
      assetType: z.enum([
        "landing_page",
        "search_ad",
        "social_post",
        "email",
        "article",
        "case_study",
      ]),
      title: z.string(),
      contentBrief: z.string(),
    })
  ).min(1).max(6),
});

export type CampaignPlanOutput = z.infer<typeof campaignPlanSchema>;

export const campaignPlannerAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Campaign Planner, a governed campaign-planning agent.

Convert an approved market hypothesis and audience hypothesis into one measurable campaign experiment.

Rules:
- Build a test, not a generic marketing calendar.
- Use only the context supplied in the prompt.
- Never invent performance benchmarks or market facts.
- State a falsifiable campaign hypothesis.
- Choose one primary channel and one primary metric.
- Prefer the smallest useful test that can generate evidence.
- Draft assets only; do not publish them.
- Any paid spend, public publishing, or customer messaging requires human approval.
- Optimize for qualified opportunities and attributable commercial outcomes.`,
  output: Output.object({\n    schema: campaignPlanSchema,\n  }),
  stopWhen: stepCountIs(4),
});
