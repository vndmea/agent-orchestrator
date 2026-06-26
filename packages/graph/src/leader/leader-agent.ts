import type {
  AgentResult,
  AgentTask,
  ExecutionContext,
  LeaderDecision,
  ReviewSummary,
  TaskPlan,
  ToolExecutionResult,
  WorkflowState
} from "@agent-orchestrator/core";
import {
  AgentTaskSchema,
  LeaderDecisionSchema,
  TaskPlanSchema
} from "@agent-orchestrator/core";
import { ModelRouter, invokeStructured } from "@agent-orchestrator/models";

import { LEADER_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from "./leader-prompts.js";

const createDefaultPlan = (task: AgentTask): TaskPlan => ({
  summary: `Coordinate leader and worker agents to achieve: ${task.goal}`,
  steps: [
    {
      id: "plan",
      title: "Plan the work",
      description: "Leader decomposes the goal into safe, reviewable steps.",
      assignedRole: "leader",
      validation: ["Ensure risks and validation strategy are explicit."]
    },
    {
      id: "execute",
      title: "Execute subtasks",
      description: "Workers produce drafts, summaries, and test ideas.",
      assignedRole: "worker",
      validation: ["Capture risks and artifacts from each worker."]
    },
    {
      id: "validate",
      title: "Validate outputs",
      description: "Deterministic tools review candidate outputs before acceptance.",
      assignedRole: "tool",
      validation: ["Run lint, tests, typecheck, or structured checks when relevant."]
    },
    {
      id: "review",
      title: "Review final result",
      description: "Leader reviews worker output and validation signals.",
      assignedRole: "reviewer",
      validation: ["Escalate to human review when confidence is low or writes are risky."]
    }
  ],
  plannedWorkerTasks: [
    {
      id: "summarize-context",
      taskType: "summarization",
      goal: `Summarize the repository context for: ${task.goal}`,
      scope:
        typeof task.input === "object" &&
        task.input !== null &&
        typeof (task.input as { scope?: unknown }).scope === "string"
          ? ((task.input as { scope?: string }).scope)
          : undefined,
      riskLevel: "low",
      expectedArtifactType: "summary"
    },
    {
      id: "draft-implementation",
      taskType: "codegen",
      goal: `Draft a safe implementation plan for: ${task.goal}`,
      scope:
        typeof task.input === "object" &&
        task.input !== null &&
        typeof (task.input as { scope?: unknown }).scope === "string"
          ? ((task.input as { scope?: string }).scope)
          : undefined,
      riskLevel: "medium",
      expectedArtifactType: "patch-plan"
    },
    {
      id: "plan-tests",
      taskType: "test-generation",
      goal: `Propose deterministic validation for: ${task.goal}`,
      scope:
        typeof task.input === "object" &&
        task.input !== null &&
        typeof (task.input as { scope?: unknown }).scope === "string"
          ? ((task.input as { scope?: string }).scope)
          : undefined,
      riskLevel: "low",
      expectedArtifactType: "test-plan"
    },
    {
      id: "review-risks",
      taskType: "review-lite",
      goal: `Review likely implementation risks for: ${task.goal}`,
      scope:
        typeof task.input === "object" &&
        task.input !== null &&
        typeof (task.input as { scope?: unknown }).scope === "string"
          ? ((task.input as { scope?: string }).scope)
          : undefined,
      riskLevel: "medium",
      expectedArtifactType: "review"
    }
  ],
  workerAssignmentProposal: [
    "summarize-worker for context compression",
    "codegen-worker for candidate implementation ideas",
    "test-worker for validation coverage"
  ],
  risks: [
    "Worker outputs may be incomplete or overconfident.",
    "Repository writes must remain in dry-run mode unless explicitly allowed."
  ],
  validationStrategy: [
    "Prefer deterministic checks before accepting model output.",
    "Require leader review of worker-generated artifacts."
  ]
});

const createReviewSummary = (
  task: AgentTask,
  workerResults: AgentResult[],
  toolResults: ToolExecutionResult[]
): ReviewSummary => {
  const risks = workerResults.flatMap((result) => result.risks);
  const failedTooling = toolResults.filter((result) => result.status === "failure");

  return {
    summary: `Reviewed ${workerResults.length} worker result(s) for goal: ${task.goal}`,
    architectureImpact:
      "Initial scaffold establishes package boundaries, workflow contracts, and tool guardrails.",
    mustFixItems: failedTooling.map(
      (result) => `${result.toolName}: validation failed`
    ),
    shouldFixItems: risks.length > 0 ? risks : ["Increase deterministic validations as workflows expand."],
    missingTests: failedTooling.length > 0 ? ["Add focused regression coverage for failing validation paths."] : [],
    riskLevel: failedTooling.length > 0 || risks.length > 2 ? "high" : "medium"
  };
};

export class LeaderAgent {
  private readonly router: ModelRouter;

  public constructor(private readonly context: ExecutionContext) {
    this.router = new ModelRouter(context.leaderModel, context.workerModel);
  }

  public async createPlan(task: AgentTask): Promise<TaskPlan> {
    AgentTaskSchema.parse(task);

    const routed = this.router.route("leader");
    const fallbackPlan = createDefaultPlan(task);
    const invocation = await invokeStructured({
      provider: routed.provider,
      config: routed.config,
      schema: TaskPlanSchema,
      systemPrompt: LEADER_SYSTEM_PROMPT,
      prompt: [
        `Create a plan for: ${task.goal}`,
        "Return summary, steps, risks, validationStrategy, workerAssignmentProposal, and plannedWorkerTasks.",
        "plannedWorkerTasks must be the exact worker tasks to execute."
      ].join("\n"),
      mockResponse: fallbackPlan,
      metadata: {
        taskId: task.id
      },
      maxAttempts: 1
    });

    if (invocation.ok) {
      return invocation.data;
    }

    return {
      ...fallbackPlan,
      risks: [
        ...fallbackPlan.risks,
        `Structured leader plan output failed validation: ${invocation.errors.join("; ")}`
      ]
    };
  }

  public async review(
    task: AgentTask,
    workerResults: AgentResult[],
    toolResults: ToolExecutionResult[]
  ): Promise<LeaderDecision> {
    const routed = this.router.route("reviewer");
    const requiresHumanReview =
      workerResults.some((result) => result.status === "needs_review") ||
      toolResults.some((result) => result.status === "failure") ||
      !this.context.allowWrite;

    const decision: LeaderDecision = {
      taskId: task.id,
      decision: requiresHumanReview ? "human-review" : "approve",
      reason: requiresHumanReview
        ? "Dry-run mode or validation concerns require explicit human confirmation."
        : "Worker outputs passed initial validation.",
      nextActions: requiresHumanReview
        ? [
            "Inspect candidate artifacts.",
            "Approve writes only after deterministic checks are satisfactory."
          ]
        : ["Proceed with accepted workflow result."],
      requiresHumanReview
    };

    const invocation = await invokeStructured({
      provider: routed.provider,
      config: routed.config,
      schema: LeaderDecisionSchema,
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      prompt: `Review ${workerResults.length} worker result(s) and ${toolResults.length} tool result(s).`,
      mockResponse: decision,
      metadata: {
        taskId: task.id
      },
      maxAttempts: 1
    });

    if (invocation.ok) {
      return invocation.data;
    }

    return LeaderDecisionSchema.parse({
      ...decision,
      reason: `${decision.reason} Structured review output failed validation; using fallback review decision. Errors: ${invocation.errors.join("; ")}`
    });
  }

  public async finalize(state: WorkflowState): Promise<AgentResult> {
    const review = state.review ?? createReviewSummary(state.task, state.workerResults, state.toolResults);
    const decision = await this.review(
      state.task,
      state.workerResults,
      state.toolResults
    );

    return {
      taskId: state.task.id,
      agentId: "leader.finalizer",
      role: "leader",
      status: decision.requiresHumanReview ? "needs_review" : "success",
      output: {
        plan: state.plan,
        review,
        decision,
        workerCapabilityProfile: state.workerCapabilityProfile,
        warnings: state.warnings
      },
      confidence: decision.requiresHumanReview ? 0.66 : 0.84,
      risks: [...review.shouldFixItems, ...state.warnings],
      artifacts: [
        {
          name: "leader-decision.json",
          type: "application/json",
          content: decision
        },
        {
          name: "worker-capability-profile.json",
          type: "application/json",
          content: state.workerCapabilityProfile
        }
      ],
      metadata: {
        workflow: "leader-worker-workflow"
      }
    };
  }

  public buildReviewSummary(
    task: AgentTask,
    workerResults: AgentResult[],
    toolResults: ToolExecutionResult[]
  ): ReviewSummary {
    return createReviewSummary(task, workerResults, toolResults);
  }
}
