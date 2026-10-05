import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

export const contentPackageSchema = z.object({
  assets: z.array(
    z.object({
      assetId: z.string(),
      title: z.string(),
      body: z.string(),
      cta: z.string(),
      metaDescription: z.string().nullable(),
      keywords: z.array(z.string()).max(10),
      evidenceNotes: z.array(z.string()).max(8),
    })
  ).min(1).max(6),
  packageNotes: z.string(),
});

export type ContentPackageOutput = z.infer<typeof contentPackageSchema>;

export const contentSeoAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: `You are Genesis Content + SEO, a governed marketing-content agent inside Metatility's Genesis AI Marketing Operating System.

You receive a campaign experiment, audience hypothesis, market brief, and asset briefs.

Rules:
- Draft only. Never publish or contact customers.
- Use only supplied context.
- Never invent testimonials, project outcomes, certifications, awards, prices, guarantees, market statistics, customer quotes, case-study facts, competitor claims, or service claims that are not explicitly supplied.
- Treat audience and market information as hypotheses unless marked as observed evidence.
- Preserve the exact assetId for every supplied asset brief.
- Match copy to the specified asset type and campaign channel.
- Write concrete, useful copy without generic AI filler.
- SEO keywords must reflect supplied service, intent, and geography context only.
- Put any claim that needs verification into evidenceNotes instead of stating it as fact.
- Every external-facing asset requires human review before use.`,
  output: Output.object({
    schema: contentPackageSchema,
  }),
  stopWhen: isStepCount(4),
});
