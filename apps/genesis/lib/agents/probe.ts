import { ToolLoopAgent } from "ai";

export const probeAgent = new ToolLoopAgent({
  model: "openai/gpt-5.6-sol",
  instructions: "Return concise, evidence-aware marketing recommendations.",
});
