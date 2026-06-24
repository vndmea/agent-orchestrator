import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  AgentTask,
  ExecutionContext,
  ToolExecutionResult,
  WorkflowState
} from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { LeaderAgent } from "../leader/leader-agent.js";
import { createInitialWorkflowState } from "../leader/leader-state.js";
import { CodegenWorker } from "../workers/codegen-worker.js";
import { ReviewWorker } from "../workers/review-worker.js";
import { SummarizeWorker } from "../workers/summarize-worker.js";
import { TestWorker } from "../workers/test-worker.js";

export interface LeaderWorkerWorkflowInput {
  context?: ExecutionContext;
  goal: string;
  scope?: string;
}

export interface LeaderWorkerWorkflowOutput {
  finalResult: WorkflowState["finalResult"];
  state: WorkflowState;
}

const LeaderWorkerState = Annotation.Root({
  task: Annotation<WorkflowState["task"]>(),
  plan: Annotation<WorkflowState["plan"]>(),
  workerResults: Annotation<WorkflowState["workerResults"]>(),
  toolResults: Annotation<WorkflowState["toolResults"]>(),
  review: Annotation<WorkflowState["review"]>(),
  finalResult: Annotation<WorkflowState["finalResult"]>(),
  errors: Annotation<WorkflowState["errors"]>()
});

const buildToolResults = (
  context: ExecutionContext,
  state: WorkflowState
): ToolExecutionResult[] => [
  {
    toolName: "validate-worker-results",
    status: state.workerResults.length > 0 ? "success" : "failure",
    output: {
      reviewedWorkers: state.workerResults.length
    },
    metadata: {
      dryRun: context.dryRun
    }
  },
  {
    toolName: "write-policy",
    status:
      context.writePolicy.evaluate(context.rootDir).mode === "execute"
        ? "success"
        : "dry-run",
    output: {
      allowWrite: context.allowWrite
    },
    metadata: {}
  }
];

export const runLeaderWorkerWorkflow = async (
  input: LeaderWorkerWorkflowInput
): Promise<LeaderWorkerWorkflowOutput> => {
  const context = input.context ?? createExecutionContextFromEnv();
  const leader = new LeaderAgent(context);
  const summarizeWorker = new SummarizeWorker(context);
  const codegenWorker = new CodegenWorker(context);
  const testWorker = new TestWorker(context);
  const reviewWorker = new ReviewWorker(context);
  const task: AgentTask = {
    id: randomUUID(),
    goal: input.goal,
    input: {
      scope: input.scope
    },
    constraints: [
      "Leader must review worker output before final acceptance.",
      "Dry-run mode applies unless writes are explicitly allowed."
    ],
    expectedOutput: "Structured final result",
    assignedRole: "leader",
    priority: "high",
    metadata: {
      workflow: "leader-worker-workflow"
    }
  };

  const initialState = createInitialWorkflowState(task);
  const app = new StateGraph(LeaderWorkerState)
    .addNode("create_plan", async (state) => ({
      ...state,
      plan: await leader.createPlan(state.task)
    }))
    .addNode("workers", async (state) => ({
      ...state,
      workerResults: await Promise.all([
        summarizeWorker.execute({ task: state.task, scope: input.scope }),
        codegenWorker.execute({ task: state.task, scope: input.scope }),
        testWorker.execute({ task: state.task }),
        reviewWorker.execute({ task: state.task })
      ])
    }))
    .addNode("validate", (state) => ({
      ...state,
      toolResults: buildToolResults(context, state)
    }))
    .addNode("build_review", (state) => ({
      ...state,
      review: leader.buildReviewSummary(
        state.task,
        state.workerResults,
        state.toolResults
      )
    }))
    .addNode("finalize", async (state) => ({
      ...state,
      finalResult: await leader.finalize(state)
    }))
    .addEdge(START, "create_plan")
    .addEdge("create_plan", "workers")
    .addEdge("workers", "validate")
    .addEdge("validate", "build_review")
    .addEdge("build_review", "finalize")
    .addEdge("finalize", END)
    .compile();

  const state = await app.invoke(initialState);

  return {
    state,
    finalResult: state.finalResult
  };
};
