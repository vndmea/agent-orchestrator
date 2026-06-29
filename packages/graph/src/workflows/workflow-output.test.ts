import { describe, expect, it } from "vitest";

import {
  formatPatchProposalWorkflowOutput,
  formatTaskSessionWorkflowOutput
} from "./workflow-output.js";

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
      humanSummary: "Review completed and the task is complete.",
      localClientRuntime: {
        configuredCommand: "node",
        resolvedCommand: "C:/Program Files/nodejs/node.exe",
        source: "configured"
      }
    });
  });

  it("surfaces denied patch reasons at the summary top level", () => {
    const summary = formatPatchProposalWorkflowOutput({
      proposal: {
        id: "patch-1",
        title: "[PLACEHOLDER] blocked",
        summary: "placeholder",
        rationale: [],
        unifiedDiff: "diff --git a/a b/a",
        files: [],
        risks: [],
        validationPlan: [],
        generatedAt: "2026-06-29T00:00:00.000Z",
        source: {
          workflow: "patch-proposal-workflow",
          workerId: "mock:worker",
          scope: "packages/core"
        }
      },
      inspection: {
        ok: false,
        files: [],
        blockedReasons: [
          "Worker mock:worker is not allowed to generate patch proposals.",
          "Patch proposal is a fallback placeholder and must not be applied."
        ],
        warnings: [],
        stats: {
          filesChanged: 0,
          additions: 0,
          deletions: 0
        }
      },
      warnings: [
        "Worker mock:worker is not allowed to generate patch proposals."
      ]
    });

    expect(summary).toMatchObject({
      deniedReason: "Worker mock:worker is not allowed to generate patch proposals.",
      deniedReasons: [
        "Worker mock:worker is not allowed to generate patch proposals.",
        "Patch proposal is a fallback placeholder and must not be applied."
      ],
      humanSummary:
        "Patch proposal is blocked: Worker mock:worker is not allowed to generate patch proposals."
    });
  });
});
