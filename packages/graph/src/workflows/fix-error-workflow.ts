import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  AgentTask,
  ExecutionContext,
  ToolExecutionResult
} from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { LeaderAgent } from "../leader/leader-agent.js";
import { createInitialWorkflowState } from "../leader/leader-state.js";
import { CodegenWorker } from "../workers/codegen-worker.js";
import { TestWorker } from "../workers/test-worker.js";

export interface FixErrorWorkflowInput {
  context?: ExecutionContext;
  errorLog: string;
  scope?: string;
}

export interface FixErrorWorkflowOutput {
  candidateFixPlan: string[];
  leaderReview: Awaited<ReturnType<LeaderAgent["review"]>>;
  rootCauseAnalysis: string;
  suggestedPatchArtifact: string;
  validationResult: ToolExecutionResult;
}

const FixErrorState = Annotation.Root({
  task: Annotation<ReturnType<typeof createInitialWorkflowState>["task"]>(),
  plan: Annotation<ReturnType<typeof createInitialWorkflowState>["plan"]>(),
  workerResults: Annotation<ReturnType<typeof createInitialWorkflowState>["workerResults"]>(),
  toolResults: Annotation<ReturnType<typeof createInitialWorkflowState>["toolResults"]>(),
  review: Annotation<ReturnType<typeof createInitialWorkflowState>["review"]>(),
  finalResult: Annotation<ReturnType<typeof createInitialWorkflowState>["finalResult"]>(),
  workerCapabilityProfile: Annotation<ReturnType<typeof createInitialWorkflowState>["workerCapabilityProfile"]>(),
  warnings: Annotation<ReturnType<typeof createInitialWorkflowState>["warnings"]>(),
  errors: Annotation<ReturnType<typeof createInitialWorkflowState>["errors"]>()
});

export const runFixErrorWorkflow = async (
  input: FixErrorWorkflowInput
): Promise<FixErrorWorkflowOutput> => {
  const context = input.context ?? createExecutionContextFromEnv();
  const leader = new LeaderAgent(context);
  const codegenWorker = new CodegenWorker(context);
  const testWorker = new TestWorker(context);
  const task: AgentTask = {
    id: randomUUID(),
    goal: "Analyze an error log and propose a safe fix plan",
    input: {
      errorLog: input.errorLog,
      scope: input.scope
    },
    constraints: [
      "Do not apply writes automatically.",
      "Return a root-cause analysis with validation guidance."
    ],
    expectedOutput: "Root cause analysis and candidate fix plan",
    assignedRole: "leader",
    priority: "high",
    metadata: {
      workflow: "fix-error-workflow"
    }
  };

  const app = new StateGraph(FixErrorState)
    .addNode("create_plan", async (state) => ({
      ...state,
      plan: await leader.createPlan(state.task)
    }))
    .addNode("workers", async (state) => ({
      ...state,
      workerResults: await Promise.all([
        codegenWorker.execute({ task: state.task, scope: input.scope }),
        testWorker.execute({ task: state.task })
      ])
    }))
    .addNode("validate", (state) => ({
      ...state,
      toolResults: [
        {
          toolName: "error-log-check",
          status: input.errorLog.trim() ? "success" : "failure",
          output: {
            hasErrorLog: Boolean(input.errorLog.trim())
          },
          metadata: {}
        }
      ]
    }))
    .addEdge(START, "create_plan")
    .addEdge("create_plan", "workers")
    .addEdge("workers", "validate")
    .addEdge("validate", END)
    .compile();

  const state = await app.invoke(createInitialWorkflowState(task));
  const leaderReview = await leader.review(
    state.task,
    state.workerResults,
    state.toolResults
  );

  return {
    rootCauseAnalysis: input.errorLog.trim()
      ? "The supplied error log should be traced from failing validation back to the owning package boundary."
      : "No error log was provided, so the analysis is incomplete.",
    candidateFixPlan: [
      "Reproduce the failing command in dry-run-safe conditions.",
      "Limit the fix to the provided scope.",
      "Run deterministic validation after the change."
    ],
    suggestedPatchArtifact: "candidate-patch-plan.md",
    validationResult: state.toolResults[0] ?? {
      toolName: "error-log-check",
      status: "failure",
      output: {
        hasErrorLog: false
      },
      metadata: {}
    },
    leaderReview
  };
};
