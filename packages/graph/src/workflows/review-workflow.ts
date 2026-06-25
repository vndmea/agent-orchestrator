import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  AgentTask,
  ExecutionContext,
  RepositoryContextPack,
  ReviewSummary,
  ValidationReport
} from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  buildRepositoryContextPack,
  readGitDiff,
  runRepositoryValidation
} from "@agent-orchestrator/tools";

import { LeaderAgent } from "../leader/leader-agent.js";
import { createInitialWorkflowState } from "../leader/leader-state.js";
import { ReviewWorker } from "../workers/review-worker.js";

export interface ReviewWorkflowInput {
  context?: ExecutionContext;
  diff?: string;
  diffBase?: string;
  diffHead?: string;
  files?: string[];
  includeDiff?: boolean;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  scope?: string;
  validate?: {
    lint?: boolean;
    test?: boolean;
    typecheck?: boolean;
  };
}

export interface ReviewWorkflowOutput {
  leaderReview: ReviewSummary;
  repositoryContext: RepositoryContextPack;
  validationReport: ValidationReport;
  workerReviewResult: ReturnType<typeof createInitialWorkflowState>["workerResults"][number] | null;
}

const ReviewState = Annotation.Root({
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

export const runReviewWorkflow = async (
  input: ReviewWorkflowInput
): Promise<ReviewWorkflowOutput> => {
  const context = input.context ?? createExecutionContextFromEnv();
  const leader = new LeaderAgent(context);
  const reviewWorker = new ReviewWorker(context);
  const diffSummary =
    input.diff
      ? {
          base: input.diffBase,
          head: input.diffHead,
          changedFiles: [],
          diffText: input.diff,
          truncated: false
        }
      : input.includeDiff || input.diffBase || input.diffHead
        ? await readGitDiff(context, {
            base: input.diffBase,
            head: input.diffHead
          })
        : undefined;
  const repositoryContext = await buildRepositoryContextPack(context, {
    rootDir: context.rootDir,
    scope: input.scope,
    files: input.files,
    includeDiff: !input.diff && Boolean(diffSummary),
    diffBase: diffSummary?.base,
    diffHead: diffSummary?.head,
    maxFileBytes: input.maxFileBytes,
    maxTotalBytes: input.maxTotalBytes
  });
  const validationReport = await runRepositoryValidation(context, {
    typecheck: input.validate?.typecheck,
    lint: input.validate?.lint,
    test: input.validate?.test,
    scope: input.scope
  });
  const task: AgentTask = {
    id: randomUUID(),
    goal: "Review diff or file list for architecture and testing impact",
    input: {
      diff: diffSummary?.diffText ?? input.diff,
      files: input.files ?? [],
      repositoryContext,
      validationReport
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
      toolResults: validationReport.checks.map((check) => ({
        toolName: `validation:${check.name}`,
        status:
          check.status === "success"
            ? "success"
            : check.status === "failure"
              ? "failure"
              : "dry-run",
        output: check,
        metadata: {}
      })),
      review: leader.buildReviewSummary(
        state.task,
        state.workerResults,
        validationReport.checks.map((check) => ({
          toolName: `validation:${check.name}`,
          status:
            check.status === "success"
              ? "success"
              : check.status === "failure"
                ? "failure"
                : "dry-run",
          output: check,
          metadata: {}
        }))
      )
    }))
    .addEdge(START, "review-worker")
    .addEdge("review-worker", "leader-review")
    .addEdge("leader-review", END)
    .compile();

  const state = await app.invoke(createInitialWorkflowState(task));
  const workerReviewResult = state.workerResults[0] ?? null;

  return {
    repositoryContext: {
      ...repositoryContext,
      ...(diffSummary ? { gitDiff: diffSummary } : {})
    },
    validationReport,
    workerReviewResult,
    leaderReview: state.review ?? leader.buildReviewSummary(task, [], [])
  };
};
