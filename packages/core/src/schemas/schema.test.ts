import { describe, expect, it } from "vitest";

import {
  AgentResultSchema,
  AgentTaskSchema,
  LeaderDecisionSchema,
  ModelConfigSchema,
  WorkflowStateSchema
} from "@agent-orchestrator/core";

describe("core schemas", () => {
  it("parses valid agent task and result data", () => {
    expect(() =>
      AgentTaskSchema.parse({
        id: "task-1",
        goal: "Plan work",
        constraints: [],
        assignedRole: "leader",
        priority: "high",
        metadata: {}
      })
    ).not.toThrow();

    expect(() =>
      AgentResultSchema.parse({
        taskId: "task-1",
        agentId: "agent-1",
        role: "worker",
        status: "success",
        output: {},
        confidence: 0.7,
        risks: [],
        artifacts: [],
        metadata: {}
      })
    ).not.toThrow();
  });

  it("rejects invalid leader decisions and model configs", () => {
    expect(() =>
      LeaderDecisionSchema.parse({
        taskId: "task-1",
        decision: "maybe",
        reason: "invalid",
        nextActions: [],
        requiresHumanReview: false
      })
    ).toThrow();

    expect(() =>
      ModelConfigSchema.parse({
        provider: "mock",
        model: "gpt-test",
        baseURL: "not-a-url"
      })
    ).toThrow();
  });

  it("parses workflow state with nullable review fields", () => {
    expect(() =>
      WorkflowStateSchema.parse({
        task: {
          id: "task-1",
          goal: "Goal",
          constraints: [],
          assignedRole: "leader",
          priority: "high",
          metadata: {}
        },
        plan: null,
        workerResults: [],
        toolResults: [],
        review: null,
        finalResult: null,
        errors: []
      })
    ).not.toThrow();
  });
});
