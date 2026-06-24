import { z } from "zod";

export const WorkerTaskTypeSchema = z.enum([
  "summarization",
  "codegen",
  "test-generation",
  "log-analysis",
  "json-extraction",
  "review-lite"
]);

export const WorkerInterviewTaskTypeSchema = z.enum([
  "instruction-following",
  "structured-output",
  "summarization",
  "code-understanding",
  "codegen",
  "confidence-calibration"
]);

export const WorkerStatusSchema = z.enum(["active", "limited", "blocked"]);

export const WorkerEvaluationScoreSchema = z.object({
  instructionFollowing: z.number().min(0).max(1),
  structuredOutput: z.number().min(0).max(1),
  reasoning: z.number().min(0).max(1),
  codeQuality: z.number().min(0).max(1),
  domainKnowledge: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1)
});

export const WorkerRoutingPolicySchema = z.object({
  maxTaskComplexity: z.enum(["low", "medium", "high"]),
  requiresLeaderReview: z.boolean(),
  allowCodegen: z.boolean(),
  allowPatchGeneration: z.boolean(),
  allowDomainTasks: z.boolean()
});

export const WorkerCapabilityProfileSchema = z.object({
  workerId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: WorkerStatusSchema,
  supportedTaskTypes: z.array(WorkerTaskTypeSchema),
  unsupportedTaskTypes: z.array(z.string()),
  score: WorkerEvaluationScoreSchema,
  risks: z.array(z.string()),
  warnings: z.array(z.string()),
  routingPolicy: WorkerRoutingPolicySchema,
  evaluatedAt: z.string().datetime()
});

export const WorkerInterviewTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: WorkerInterviewTaskTypeSchema,
  prompt: z.string().min(1),
  expectedOutputDescription: z.string().min(1)
});

export const WorkerInterviewTaskResultSchema = z.object({
  taskId: z.string().min(1),
  type: WorkerInterviewTaskTypeSchema,
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  findings: z.array(z.string()),
  rawOutput: z.unknown()
});

export const WorkerInterviewResultSchema = z.object({
  workerId: z.string().min(1),
  profile: WorkerCapabilityProfileSchema,
  status: WorkerStatusSchema,
  taskResults: z.array(WorkerInterviewTaskResultSchema),
  warnings: z.array(z.string())
});

export const WorkerEvaluationSuiteSchema = z.object({
  name: z.string().min(1),
  tasks: z.array(WorkerInterviewTaskSchema)
});
