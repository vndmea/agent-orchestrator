import { z } from "zod";

import { AgentRoleSchema } from "./agent-task.schema.js";

export const AgentResultStatusSchema = z.enum([
  "success",
  "failure",
  "needs_review"
]);

export const AgentArtifactSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  content: z.unknown()
});

export const AgentResultSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  role: AgentRoleSchema,
  status: AgentResultStatusSchema,
  output: z.unknown(),
  confidence: z.number().min(0).max(1),
  risks: z.array(z.string()),
  artifacts: z.array(AgentArtifactSchema),
  metadata: z.record(z.string(), z.unknown())
});
