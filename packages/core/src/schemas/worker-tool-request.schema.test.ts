import { describe, expect, it } from "vitest";

import {
  UserPermissionGrantSchema,
  WorkerToolPermissionDecisionSchema,
  WorkerToolRequestSchema,
  WorkerToolResultSchema
} from "@mcp-code-worker/core";

describe("worker tool request schemas", () => {
  it("parses action-specific read snippet requests", () => {
    const result = WorkerToolRequestSchema.safeParse({
      id: "tool-req-1",
      action: "read_file_snippet",
      reason: "Need the exact implementation before proposing a patch.",
      scope: "packages/core",
      path: "packages/core/src/index.ts",
      selector: {
        kind: "line-range",
        startLine: 1,
        endLine: 12
      },
      limits: {
        maxBytes: 1200
      },
      expectedUse: "Ground the patch proposal in the selected file."
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid field combinations for discriminated requests", () => {
    const result = WorkerToolRequestSchema.safeParse({
      id: "tool-req-2",
      action: "run_validation_command",
      reason: "Need validation output.",
      command: "pnpm test",
      limits: {},
      expectedUse: "Claim tests passed."
    });

    expect(result.success).toBe(false);
  });

  it("parses permission decisions, grants, and tool results", () => {
    const decidedAt = new Date().toISOString();

    expect(
      WorkerToolPermissionDecisionSchema.safeParse({
        requestId: "tool-req-1",
        mode: "ask-user",
        allowed: false,
        reason: "Path is outside the current scope.",
        normalizedPaths: ["packages/cli/src/index.ts"],
        riskLevel: "medium",
        requiresUserApproval: true
      }).success
    ).toBe(true);

    expect(
      UserPermissionGrantSchema.safeParse({
        id: "grant-1",
        requestId: "tool-req-1",
        taskId: "task-1",
        action: "read_file_snippet",
        pathPrefix: "packages/cli",
        grantScope: "once",
        granted: true,
        status: "granted",
        decidedAt,
        decidedBy: {
          surface: "codex"
        }
      }).success
    ).toBe(true);

    expect(
      WorkerToolResultSchema.safeParse({
        requestId: "tool-req-1",
        action: "read_file_snippet",
        ok: true,
        summary: "Read 12 lines.",
        evidence: [
          {
            path: "packages/core/src/index.ts",
            lineStart: 1,
            lineEnd: 12,
            snippet: "export const value = 1;"
          }
        ],
        truncated: false,
        warnings: []
      }).success
    ).toBe(true);
  });
});
