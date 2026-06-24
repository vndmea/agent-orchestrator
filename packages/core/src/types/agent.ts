import type { ZodType } from "zod";

export type AgentRole = "leader" | "worker" | "reviewer" | "tool";

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
  preferredModel?: string;
  costTier: WorkerCostTier;
}
