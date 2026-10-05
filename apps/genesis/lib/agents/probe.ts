import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

const probeSchema = z.object({
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
});

export const probeAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: "Return concise, evidence-aware marketing recommendations.",
  output: Output.object({ schema: probeSchema }),
  stopWhen: isStepCount(4),
});
