import type { AgentResult } from "./result.js";
import type { WorkerCapabilityProfile } from "./agent.js";
import type { AgentTask } from "./task.js";

export interface TaskPlanStep {
  id: string;
  title: string;
  description: string;
  assignedRole: "leader" | "worker" | "reviewer" | "tool";
  validation: string[];
}

export interface TaskPlan {
  summary: string;
  steps: TaskPlanStep[];
  workerAssignmentProposal: string[];
  risks: string[];
  validationStrategy: string[];
}

export interface ReviewSummary {
  summary: string;
  architectureImpact: string;
  mustFixItems: string[];
  shouldFixItems: string[];
  missingTests: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface ToolExecutionResult {
  toolName: string;
  status: "success" | "failure" | "dry-run";
  output: unknown;
  metadata: Record<string, unknown>;
}

export interface ModelConfig {
  provider: string;
  model: string;
  baseURL?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface WorkflowState {
  task: AgentTask;
  plan: TaskPlan | null;
  workerResults: AgentResult[];
  toolResults: ToolExecutionResult[];
  review: ReviewSummary | null;
  finalResult: AgentResult | null;
  workerCapabilityProfile: WorkerCapabilityProfile | null;
  warnings: string[];
  errors: string[];
}

export interface WorkflowDefinition<Input, Output> {
  description: string;
  name: string;
  run: (input: Input) => Promise<Output>;
}

export interface WorkflowDescriptor {
  name: string;
  description: string;
  risky?: boolean;
}
