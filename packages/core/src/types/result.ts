import type { AgentRole } from "./agent.js";

export type AgentResultStatus = "success" | "failure" | "needs_review";

export interface AgentArtifact {
  name: string;
  type: string;
  content: unknown;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  role: AgentRole;
  status: AgentResultStatus;
  output: unknown;
  confidence: number;
  risks: string[];
  artifacts: AgentArtifact[];
  metadata: Record<string, unknown>;
}
