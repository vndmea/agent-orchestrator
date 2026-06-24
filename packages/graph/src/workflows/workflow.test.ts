import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  runLeaderWorkerWorkflow,
  runPlanningWorkflow
} from "@agent-orchestrator/graph";

describe("planning workflow", () => {
  it("produces a structured plan with risks and validation strategy", async () => {
    const result = await runPlanningWorkflow({
      context: createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      }),
      goal: "Create a new orchestration package"
    });

    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.riskList.length).toBeGreaterThan(0);
    expect(result.validationStrategy.length).toBeGreaterThan(0);
  });
});

describe("leader-worker workflow", () => {
  it("transitions through planning, worker execution, and final review", async () => {
    const result = await runLeaderWorkerWorkflow({
      context: createExecutionContextFromEnv(undefined, {
        dryRun: true,
        allowWrite: false
      }),
      goal: "Draft tests for workflow routing"
    });

    expect(result.state.plan).not.toBeNull();
    expect(result.state.workerResults).toHaveLength(4);
    expect(result.state.toolResults.length).toBeGreaterThan(0);
    expect(result.finalResult?.status).toBe("needs_review");
  });
});
