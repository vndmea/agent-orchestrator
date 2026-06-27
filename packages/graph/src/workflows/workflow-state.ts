import type { AgentTask, WorkflowState } from "@mcp-code-worker/core";

export const createInitialWorkflowState = (
  task: AgentTask
): WorkflowState => ({
  task,
  plan: null,
  workerResults: [],
  toolResults: [],
  review: null,
  finalResult: null,
  workerCapabilityProfile: null,
  warnings: [],
  errors: []
});
