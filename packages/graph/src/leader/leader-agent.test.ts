import { describe, expect, it } from "vitest";

import type { ModelConfig } from "@agent-orchestrator/core";
import {
  createExecutionContextFromEnv,
  type AgentTask
} from "@agent-orchestrator/core";
import { LeaderAgent } from "@agent-orchestrator/graph";
import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "@agent-orchestrator/models";

class SequenceProvider implements ModelProvider {
  public readonly name = "sequence";

  public constructor(
    private readonly responses: ModelInvocationResult[]
  ) {}

  public async invoke(
    _config: ModelConfig,
    _request: ModelInvocationRequest
  ): Promise<ModelInvocationResult> {
    return this.responses.shift() ?? {
      provider: "sequence",
      model: "test-model",
      text: "{}"
    };
  }
}

const createTask = (): AgentTask => ({
  id: "task-1",
  goal: "Review the workflow",
  assignedRole: "leader",
  priority: "high",
  constraints: [],
  metadata: {}
});

const patchLeaderProvider = (
  agent: LeaderAgent,
  provider: ModelProvider
): void => {
  const router = (agent as unknown as {
    router: { providers: Map<string, ModelProvider> };
  }).router;
  router.providers.set("mock", provider);
};

describe("LeaderAgent structured outputs", () => {
  it("uses parsed provider output for plan generation", async () => {
    const agent = new LeaderAgent(
      createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      })
    );
    patchLeaderProvider(
      agent,
      new SequenceProvider([
        {
          provider: "sequence",
          model: "test-model",
          text: JSON.stringify({
            summary: "Provider-authored plan",
            steps: [
              {
                id: "s1",
                title: "Inspect",
                description: "Inspect the codebase",
                assignedRole: "leader",
                validation: ["Read target files"]
              }
            ],
            workerAssignmentProposal: ["summarize-worker"],
            risks: ["Needs review"],
            validationStrategy: ["Run tests"]
          })
        }
      ])
    );

    const plan = await agent.createPlan(createTask());

    expect(plan.summary).toBe("Provider-authored plan");
    expect(plan.steps).toHaveLength(1);
  });

  it("falls back to the default plan and appends a validation risk", async () => {
    const agent = new LeaderAgent(
      createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      })
    );
    patchLeaderProvider(
      agent,
      new SequenceProvider([
        {
          provider: "sequence",
          model: "test-model",
          text: '{"summary":"bad"}'
        }
      ])
    );

    const plan = await agent.createPlan(createTask());

    expect(plan.summary).toContain("Coordinate leader and worker agents");
    expect(plan.risks.some((risk) => risk.includes("Structured leader plan output failed validation"))).toBe(true);
  });

  it("uses parsed provider output for review decisions", async () => {
    const agent = new LeaderAgent(
      createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      })
    );
    patchLeaderProvider(
      agent,
      new SequenceProvider([
        {
          provider: "sequence",
          model: "test-model",
          text: JSON.stringify({
            taskId: "task-1",
            decision: "revise",
            reason: "Provider review decision",
            nextActions: ["Tighten validation"],
            requiresHumanReview: true
          })
        }
      ])
    );

    const decision = await agent.review(createTask(), [], []);

    expect(decision.decision).toBe("revise");
    expect(decision.reason).toBe("Provider review decision");
  });

  it("falls back to a local review decision when structured output is invalid", async () => {
    const agent = new LeaderAgent(
      createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      })
    );
    patchLeaderProvider(
      agent,
      new SequenceProvider([
        {
          provider: "sequence",
          model: "test-model",
          text: '{"decision":"approve"}'
        }
      ])
    );

    const decision = await agent.review(createTask(), [], []);

    expect(decision.decision).toBe("human-review");
    expect(decision.reason).toContain("Structured review output failed validation");
  });
});
