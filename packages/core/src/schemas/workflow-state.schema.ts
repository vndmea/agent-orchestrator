import { z } from "zod";

import { AgentResultSchema } from "./agent-result.schema.js";
import { AgentTaskSchema, AgentRoleSchema } from "./agent-task.schema.js";

export const TaskPlanStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  assignedRole: AgentRoleSchema,
  validation: z.array(z.string())
});

export const TaskPlanSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(TaskPlanStepSchema),
  workerAssignmentProposal: z.array(z.string()),
  risks: z.array(z.string()),
  validationStrategy: z.array(z.string())
});

export const ReviewSummarySchema = z.object({
  summary: z.string().min(1),
  architectureImpact: z.string().min(1),
  mustFixItems: z.array(z.string()),
  shouldFixItems: z.array(z.string()),
  missingTests: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"])
});

export const ToolExecutionResultSchema = z.object({
  toolName: z.string().min(1),
  status: z.enum(["success", "failure", "dry-run"]),
  output: z.unknown(),
  metadata: z.record(z.string(), z.unknown())
});

export const WorkflowStateSchema = z.object({
  task: AgentTaskSchema,
  plan: TaskPlanSchema.nullable(),
  workerResults: z.array(AgentResultSchema),
  toolResults: z.array(ToolExecutionResultSchema),
  review: ReviewSummarySchema.nullable(),
  finalResult: AgentResultSchema.nullable(),
  errors: z.array(z.string())
});
