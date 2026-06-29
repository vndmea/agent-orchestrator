import { describe, expect, it } from "vitest";

import { formatTaskSessionWorkflowOutput } from "./workflow-output.js";

describe("formatTaskSessionWorkflowOutput", () => {
  it("includes resolved local client details in summary mode", () => {
    const summary = formatTaskSessionWorkflowOutput({
      localClientRuntime: {
        configuredCommand: "node",
        resolvedCommand: "C:/Program Files/nodejs/node.exe",
        resolvedPath: "C:/Program Files/nodejs/node.exe",
        source: "configured"
      },
      mode: "dry-run",
      nextRecommendedActions: [],
      persistence: {
        artifactRegistryComplete: false,
        artifactsReadable: false,
        reportRegistered: false,
        resumable: false,
        sessionPersisted: false,
        storageKind: "temporary"
      },
      readinessSummary: "Temporary result only.",
      report: "report",
      repositoryWriteMode: "dry-run",
      rootDir: "/tmp/repo",
      session: {
        taskId: "task-1",
        goal: "Review packages/core",
        scope: "packages/core",
        workerId: "mock:worker",
        requireProfile: false,
        status: "completed",
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:00.000Z",
        steps: [],
        artifacts: {},
        warnings: [],
        errors: [],
        metadata: {}
      },
      sessionPath: "/tmp/session.json",
      sessionWriteMode: "dry-run",
      workerId: "mock:worker",
      workspaceBinding: {
        callerWorkingDirectory: "/tmp/repo",
        matchesCallerWorkingDirectory: true,
        rootDir: "/tmp/repo",
        switchedFrom: undefined
      }
    });

    expect(summary).toMatchObject({
      localClientRuntime: {
        configuredCommand: "node",
        resolvedCommand: "C:/Program Files/nodejs/node.exe",
        source: "configured"
      }
    });
  });
});
