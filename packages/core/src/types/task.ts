import type { AgentRole } from "./agent.js";

export type TaskPriority = "low" | "medium" | "high";

export interface AgentTask {
  id: string;
  goal: string;
  input?: unknown;
  constraints: string[];
  expectedOutput?: string;
  assignedRole: AgentRole;
  priority: TaskPriority;
  metadata: Record<string, unknown>;
}
