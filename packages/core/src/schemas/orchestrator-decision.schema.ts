import { z } from "zod";

export const OrchestratorDecisionSchema = z.object({
  taskId: z.string().min(1),
  decision: z.enum(["approve", "revise", "reject", "human-review"]),
  reason: z.string().min(1),
  nextActions: z.array(z.string()),
  requiresHumanReview: z.boolean()
});
