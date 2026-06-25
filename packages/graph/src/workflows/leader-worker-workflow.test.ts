import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AgentError, createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runLeaderWorkerWorkflow } from "@agent-orchestrator/graph";

const createRootDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "ao-leader-worker-"));

const createProfile = (overrides: Record<string, unknown> = {}) => ({
  workerId: "mock:gpt-5.4-mini",
  provider: "mock",
  model: "gpt-5.4-mini",
  status: "active",
  supportedTaskTypes: [
    "summarization",
    "log-analysis",
    "json-extraction",
    "review-lite",
    "codegen",
    "test-generation"
  ],
  unsupportedTaskTypes: [],
  score: {
    instructionFollowing: 0.9,
    structuredOutput: 0.9,
    reasoning: 0.9,
    codeQuality: 0.9,
    domainKnowledge: 0.8,
    reliability: 0.9
  },
  risks: [],
  warnings: [],
  routingPolicy: {
    maxTaskComplexity: "medium",
    requiresLeaderReview: false,
    allowCodegen: true,
    allowPatchGeneration: true,
    allowDomainTasks: true
  },
  evaluatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  suiteName: "default-worker-onboarding-suite",
  suiteVersion: "1",
  ...overrides
});

const writeProfiles = async (rootDir: string, profiles: unknown[]): Promise<void> => {
  const aoDir = join(rootDir, ".ao");
  await mkdir(aoDir, { recursive: true });
  await writeFile(
    join(aoDir, "worker-profiles.json"),
    JSON.stringify(profiles, null, 2),
    "utf8"
  );
};

const createContext = (rootDir: string) =>
  createExecutionContextFromEnv(undefined, {
    allowWrite: false,
    dryRun: true,
    rootDir,
    workerModel: {
      provider: "mock",
      model: "gpt-5.4-mini"
    }
  });

describe("leader-worker workflow with persisted profiles", () => {
  it("uses a persisted worker profile when one is available", async () => {
    const rootDir = await createRootDir();
    await writeProfiles(rootDir, [createProfile()]);

    const result = await runLeaderWorkerWorkflow({
      context: createContext(rootDir),
      goal: "Review this repository"
    });

    expect(result.state.workerCapabilityProfile?.workerId).toBe("mock:gpt-5.4-mini");
    expect(result.state.warnings).not.toContain(
      expect.stringContaining("ran a fresh interview")
    );
  });

  it("runs a fresh interview when no persisted profile exists and requireProfile is false", async () => {
    const rootDir = await createRootDir();

    const result = await runLeaderWorkerWorkflow({
      context: createContext(rootDir),
      goal: "Review this repository"
    });

    expect(result.state.workerCapabilityProfile).not.toBeNull();
    expect(result.state.warnings.join("\n")).toContain("was missing; ran a fresh interview");
  });

  it("fails early when no persisted profile exists and requireProfile is true", async () => {
    const rootDir = await createRootDir();

    await expect(
      runLeaderWorkerWorkflow({
        context: createContext(rootDir),
        goal: "Review this repository",
        requireProfile: true
      })
    ).rejects.toBeInstanceOf(AgentError);
  });

  it("prevents blocked persisted workers from receiving production tasks", async () => {
    const rootDir = await createRootDir();
    await writeProfiles(
      rootDir,
      [
        createProfile({
          status: "blocked",
          supportedTaskTypes: [],
          unsupportedTaskTypes: [
            "summarization",
            "log-analysis",
            "json-extraction",
            "review-lite",
            "codegen",
            "test-generation"
          ],
          warnings: ["Do not route production tasks to this worker."],
          routingPolicy: {
            maxTaskComplexity: "low",
            requiresLeaderReview: true,
            allowCodegen: false,
            allowPatchGeneration: false,
            allowDomainTasks: false
          }
        })
      ]
    );

    const result = await runLeaderWorkerWorkflow({
      context: createContext(rootDir),
      goal: "Review this repository",
      requireProfile: true
    });

    expect(result.state.workerResults).toHaveLength(0);
    expect(result.state.warnings.join("\n")).toContain("blocked");
  });

  it("restricts code generation for limited persisted workers", async () => {
    const rootDir = await createRootDir();
    await writeProfiles(
      rootDir,
      [
        createProfile({
          status: "limited",
          supportedTaskTypes: ["summarization", "log-analysis", "json-extraction", "review-lite"],
          unsupportedTaskTypes: ["codegen", "test-generation"],
          warnings: ["Code generation is disabled for this worker."],
          routingPolicy: {
            maxTaskComplexity: "low",
            requiresLeaderReview: true,
            allowCodegen: false,
            allowPatchGeneration: false,
            allowDomainTasks: false
          }
        })
      ]
    );

    const result = await runLeaderWorkerWorkflow({
      context: createContext(rootDir),
      goal: "Generate implementation drafts",
      requireProfile: true
    });

    expect(
      result.state.workerResults.some((workerResult) => workerResult.agentId === "worker.codegen")
    ).toBe(false);
    expect(result.state.warnings.join("\n")).toContain("not qualified for codegen");
  });
});
