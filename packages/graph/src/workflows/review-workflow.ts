import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AgentTask, ExecutionContext, ReviewSummary } from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { LeaderAgent } from "../leader/leader-agent.js";
import { createInitialWorkflowState } from "../leader/leader-state.js";
import { ReviewWorker } from "../workers/review-worker.js";

export interface ReviewWorkflowInput {
  context?: ExecutionContext;
  diff?: string;
  files?: string[];
}

const ReviewState = Annotation.Root({
  task: Annotation<ReturnType<typeof createInitialWorkflowState>["task"]>(),
  plan: Annotation<ReturnType<typeof createInitialWorkflowState>["plan"]>(),
  workerResults: Annotation<ReturnType<typeof createInitialWorkflowState>["workerResults"]>(),
  toolResults: Annotation<ReturnType<typeof createInitialWorkflowState>["toolResults"]>(),
  review: Annotation<ReturnType<typeof createInitialWorkflowState>["review"]>(),
  finalResult: Annotation<ReturnType<typeof createInitialWorkflowState>["finalResult"]>(),
  errors: Annotation<ReturnType<typeof createInitialWorkflowState>["errors"]>()
});

export const runReviewWorkflow = async (
  input: ReviewWorkflowInput
): Promise<ReviewSummary> => {
  const context = input.context ?? createExecutionContextFromEnv();
  const leader = new LeaderAgent(context);
  const reviewWorker = new ReviewWorker(context);
  const task: AgentTask = {
    id: randomUUID(),
    goal: "Review diff or file list for architecture and testing impact",
    input: {
      diff: input.diff,
      files: input.files ?? []
    },
    constraints: ["Return structured review output."],
    expectedOutput: "Review summary",
    assignedRole: "reviewer",
    priority: "medium",
    metadata: {
      workflow: "review-workflow"
    }
  };

  const app = new StateGraph(ReviewState)
    .addNode("review-worker", async (state) => ({
      ...state,
      workerResults: [await reviewWorker.execute({ task: state.task })]
    }))
    .addNode("leader-review", (state) => ({
      ...state,
      review: leader.buildReviewSummary(state.task, state.workerResults, [])
    }))
    .addEdge(START, "review-worker")
    .addEdge("review-worker", "leader-review")
    .addEdge("leader-review", END)
    .compile();

  const state = await app.invoke(createInitialWorkflowState(task));
  return state.review ?? leader.buildReviewSummary(task, [], []);
};
