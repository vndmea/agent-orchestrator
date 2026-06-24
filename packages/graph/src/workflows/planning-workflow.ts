import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  AgentTask,
  ExecutionContext,
  TaskPlan,
  WorkflowState
} from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { LeaderAgent } from "../leader/leader-agent.js";
import { createInitialWorkflowState } from "../leader/leader-state.js";

export interface PlanningWorkflowInput {
  context?: ExecutionContext;
  contextFiles?: string[];
  goal: string;
}

export interface PlanningWorkflowOutput {
  plan: TaskPlan;
  riskList: string[];
  task: AgentTask;
  validationStrategy: string[];
  workerAssignmentProposal: string[];
}

const PlanningState = Annotation.Root({
  task: Annotation<WorkflowState["task"]>(),
  plan: Annotation<WorkflowState["plan"]>(),
  workerResults: Annotation<WorkflowState["workerResults"]>(),
  toolResults: Annotation<WorkflowState["toolResults"]>(),
  review: Annotation<WorkflowState["review"]>(),
  finalResult: Annotation<WorkflowState["finalResult"]>(),
  workerCapabilityProfile: Annotation<WorkflowState["workerCapabilityProfile"]>(),
  warnings: Annotation<WorkflowState["warnings"]>(),
  errors: Annotation<WorkflowState["errors"]>()
});

export const runPlanningWorkflow = async (
  input: PlanningWorkflowInput
): Promise<PlanningWorkflowOutput> => {
  const context = input.context ?? createExecutionContextFromEnv();
  const leader = new LeaderAgent(context);
  const task: AgentTask = {
    id: randomUUID(),
    goal: input.goal,
    input: {
      contextFiles: input.contextFiles ?? []
    },
    constraints: [
      "Prefer deterministic tools where available.",
      "Default to dry-run unless writes are explicitly allowed."
    ],
    expectedOutput: "Structured task plan",
    assignedRole: "leader",
    priority: "high",
    metadata: {
      workflow: "planning-workflow"
    }
  };
  const initialState = createInitialWorkflowState(task);

  const app = new StateGraph(PlanningState)
    .addNode("create_plan", async (state) => ({
      ...state,
      plan: await leader.createPlan(state.task)
    }))
    .addEdge(START, "create_plan")
    .addEdge("create_plan", END)
    .compile();

  const result = await app.invoke(initialState);
  const plan = result.plan ?? (await leader.createPlan(task));

  return {
    plan,
    task,
    riskList: plan.risks,
    validationStrategy: plan.validationStrategy,
    workerAssignmentProposal: plan.workerAssignmentProposal
  };
};
