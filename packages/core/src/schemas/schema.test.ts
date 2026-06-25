import { describe, expect, it } from "vitest";

import {
  AgentResultSchema,
  AgentTaskSchema,
  LeaderDecisionSchema,
  ModelConfigSchema,
  RepositoryContextPackSchema,
  ValidationReportSchema,
  WorkerCapabilityProfileSchema,
  WorkerRegistrationSchema,
  WorkerRegistrySchema,
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
        workerCapabilityProfile: null,
        warnings: [],
        errors: []
      })
    ).not.toThrow();
  });

  it("parses worker capability profiles", () => {
    expect(() =>
      WorkerCapabilityProfileSchema.parse({
        workerId: "mock:gpt-5.4-mini",
        provider: "mock",
        model: "gpt-5.4-mini",
        status: "limited",
        supportedTaskTypes: ["summarization", "json-extraction"],
        unsupportedTaskTypes: ["codegen"],
        score: {
          instructionFollowing: 0.9,
          structuredOutput: 0.8,
          reasoning: 0.75,
          codeQuality: 0.3,
          domainKnowledge: 0.7,
          reliability: 0.68
        },
        risks: ["codegen quality is low"],
        warnings: ["do not route codegen tasks"],
        routingPolicy: {
          maxTaskComplexity: "low",
          requiresLeaderReview: true,
          allowCodegen: false,
          allowPatchGeneration: false,
          allowDomainTasks: false
        },
        evaluatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        suiteName: "default-worker-onboarding-suite",
        suiteVersion: "1"
      })
    ).not.toThrow();
  });

  it("parses worker registry records without accepting stored API keys", () => {
    const now = new Date().toISOString();
    const registration = WorkerRegistrationSchema.parse({
      workerId: "litellm:qwen3-coder",
      provider: "litellm",
      model: "qwen3-coder",
      createdAt: now,
      updatedAt: now,
      apiKey: "should-not-survive"
    });

    expect(registration.enabled).toBe(true);
    expect(registration.tags).toEqual([]);
    expect("apiKey" in registration).toBe(false);
    expect(() =>
      WorkerRegistrySchema.parse({
        version: 1,
        workers: [registration]
      })
    ).not.toThrow();
    expect(() =>
      WorkerRegistrationSchema.parse({
        workerId: "",
        provider: "litellm",
        model: "qwen3-coder",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });

  it("parses repository context packs and validation reports", () => {
    expect(() =>
      RepositoryContextPackSchema.parse({
        rootDir: "/repo",
        files: [
          {
            path: "package.json",
            sizeBytes: 100,
            selected: true
          }
        ],
        selectedFiles: [
          {
            path: "package.json",
            content: "{\"name\":\"demo\"}",
            truncated: false,
            sizeBytes: 100
          }
        ],
        warnings: [],
        generatedAt: new Date().toISOString()
      })
    ).not.toThrow();

    expect(() =>
      ValidationReportSchema.parse({
        checks: [
          {
            name: "typecheck",
            command: "pnpm typecheck",
            status: "success"
          }
        ],
        ok: true,
        warnings: []
      })
    ).not.toThrow();

    expect(() =>
      ValidationReportSchema.parse({
        checks: [
          {
            name: "typecheck",
            command: "pnpm typecheck",
            status: "unknown"
          }
        ],
        ok: true,
        warnings: []
      })
    ).toThrow();
  });
});
