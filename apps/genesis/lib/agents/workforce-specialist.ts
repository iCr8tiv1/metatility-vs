import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export const specialistTaskResultSchema = z.object({
  summary: z.string().min(1).max(1800),
  confidence: z.number().min(0).max(1),
  findings: z
    .array(
      z.object({
        finding: z.string().min(1).max(700),
        evidenceStatus: z.enum([
          "supplied_context",
          "internal_inference",
          "hypothesis",
        ]),
        evidence: z.string().min(1).max(900),
        implication: z.string().min(1).max(700),
      }),
    )
    .max(8),
  deliverables: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        type: z.enum([
          "brief",
          "analysis",
          "plan",
          "draft",
          "qualification",
          "measurement",
        ]),
        content: z.string().min(1).max(5000),
      }),
    )
    .min(1)
    .max(6),
  evidenceGaps: z.array(z.string().min(1).max(500)).max(8),
  recommendedNextAction: z.string().min(1).max(900),
  requiresHumanReview: z.boolean(),
  memoryCandidates: z
    .array(
      z.object({
        memoryType: z.enum([
          "fact",
          "preference",
          "decision",
          "lesson",
          "pattern",
          "summary",
        ]),
        subject: z.string().min(1).max(180),
        content: z.string().min(1).max(1800),
        confidence: z.number().min(0).max(1),
        importance: z.number().int().min(1).max(5),
      }),
    )
    .max(6),
});

export type SpecialistTaskResult = z.infer<typeof specialistTaskResultSchema>;

const roleProfiles: Record<string, string> = {
  market_intelligence: `You are Elias, Genesis Market Intelligence.
Investigate the supplied operating context, distinguish evidence from hypothesis, identify commercial signals and evidence gaps, and return a concise intelligence deliverable. Never imply live research unless external evidence is explicitly supplied.`,

  campaign_planner: `You are Nova, Genesis Campaign Director.
Turn the supplied objective and evidence into a bounded campaign or experiment plan. Define the commercial hypothesis, audience logic, primary metric, smallest useful test, and learning goal. Draft plans only; never launch, publish, spend, or contact customers.`,

  content_seo: `You are Avery, Genesis Content Director.
Create governed content or SEO deliverables using only supplied context. Never invent customer claims, testimonials, pricing, certifications, statistics, guarantees, competitor facts, or case-study outcomes. Draft only; all external use remains subject to human control.`,

  lead_intelligence: `You are Maya, Genesis Lead Intelligence.
Analyze supplied lead or qualification context conservatively. Protect sales capacity, identify missing evidence, and make precise recommendations about fit, intent, timing, authority, and next action. Do not invent lead facts or contact anyone.`,

  nurture: `You are Sofia, Genesis Nurture Director.
Develop permission-aware lifecycle strategy from supplied context. Prefer useful, limited follow-up over repetitive outreach. Draft only. Do not send messages, infer consent, invent urgency, discounts, availability, or customer facts.`,

  analytics: `You are Orion, Genesis Performance Analyst.
Analyze only observed telemetry supplied in context. Separate observed facts from missing evidence, avoid causal overclaiming, identify measurement gaps, and recommend the next measurable action. Never treat disconnected data sources as zero business activity.`,
};

export function createWorkforceSpecialistAgent(agentKey: string) {
  const roleProfile = roleProfiles[agentKey];

  if (!roleProfile) {
    throw new Error(`No workforce runtime profile exists for agent key: ${agentKey}`);
  }

  return new ToolLoopAgent({
    model: "openai/gpt-5.6-sol",
    instructions: `${roleProfile}

You are executing one bounded internal Genesis work item.

Runtime rules:
- Use only the task, objective, plan, memory, and operating context supplied in the prompt.
- Never claim access to external systems, live research, customer communication, publishing, paid media, or data that is not explicitly present.
- Label unsupported ideas as hypotheses.
- Produce concrete deliverables that another Genesis agent or human operator can use.
- Do not perform irreversible or external actions.
- If the logical next step would publish, contact a person, spend money, change a material budget, or make a consequential external claim, set requiresHumanReview=true and describe that next action without executing it.
- Memory candidates must contain only durable lessons or facts supported by the supplied context or by the work you just completed. Do not turn speculation into memory.
- Keep outputs commercially useful, auditable, and concise.`,
    output: Output.object({
      schema: specialistTaskResultSchema,
    }),
    stopWhen: isStepCount(4),
  });
}
