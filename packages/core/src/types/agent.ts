import type { ZodType } from "zod";

export type AgentRole = "leader" | "worker" | "reviewer" | "tool";
export type WorkerTaskType =
  | "summarization"
  | "codegen"
  | "test-generation"
  | "log-analysis"
  | "json-extraction"
  | "review-lite";
export type WorkerInterviewTaskType =
  | "instruction-following"
  | "structured-output"
  | "summarization"
  | "code-understanding"
  | "codegen"
  | "confidence-calibration";
export type WorkerStatus = "active" | "limited" | "blocked";

export type LeaderDecisionType =
  | "approve"
  | "revise"
  | "reject"
  | "human-review";

export interface LeaderDecision {
  taskId: string;
  decision: LeaderDecisionType;
  reason: string;
  nextActions: string[];
  requiresHumanReview: boolean;
}

export type WorkerCostTier = "low" | "medium" | "high";

export interface WorkerCapability {
  name: string;
  description: string;
  inputSchema: ZodType;
  outputSchema: ZodType;
  supportedTaskTypes: WorkerTaskType[];
  preferredModel?: string;
  costTier: WorkerCostTier;
}

export interface WorkerEvaluationScore {
  instructionFollowing: number;
  structuredOutput: number;
  reasoning: number;
  codeQuality: number;
  domainKnowledge: number;
  reliability: number;
}

export interface WorkerRoutingPolicy {
  maxTaskComplexity: "low" | "medium" | "high";
  requiresLeaderReview: boolean;
  allowCodegen: boolean;
  allowPatchGeneration: boolean;
  allowDomainTasks: boolean;
}

export interface WorkerCapabilityProfile {
  workerId: string;
  provider: string;
  model: string;
  status: WorkerStatus;
  supportedTaskTypes: WorkerTaskType[];
  unsupportedTaskTypes: string[];
  score: WorkerEvaluationScore;
  risks: string[];
  warnings: string[];
  routingPolicy: WorkerRoutingPolicy;
  evaluatedAt: string;
  expiresAt?: string;
  suiteName?: string;
  suiteVersion?: string;
}

export interface WorkerInterviewTask {
  id: string;
  title: string;
  type: WorkerInterviewTaskType;
  prompt: string;
  expectedOutputDescription: string;
}

export interface WorkerInterviewTaskResult {
  taskId: string;
  type: WorkerInterviewTaskType;
  passed: boolean;
  score: number;
  findings: string[];
  rawOutput: unknown;
}

export interface WorkerInterviewResult {
  workerId: string;
  profile: WorkerCapabilityProfile;
  status: WorkerStatus;
  taskResults: WorkerInterviewTaskResult[];
  warnings: string[];
}

export interface WorkerEvaluationSuite {
  name: string;
  tasks: WorkerInterviewTask[];
}
