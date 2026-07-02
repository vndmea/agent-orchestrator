import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@mcp-code-worker/core";

import { evaluateWorkerToolRequest } from "./worker-tool-permission.js";

const createWorkspace = async (): Promise<string> => {
  const rootDir = await mkdtemp(join(tmpdir(), "cw-worker-tool-policy-"));
  await mkdir(join(rootDir, "packages", "core", "src"), { recursive: true });
  await mkdir(join(rootDir, "packages", "cli", "src"), { recursive: true });
  await writeFile(
    join(rootDir, "packages", "core", "src", "index.ts"),
    "export const value = 1;\n",
    "utf8"
  );
  await writeFile(join(rootDir, ".env"), "SECRET=value\n", "utf8");
  return rootDir;
};

describe("evaluateWorkerToolRequest", () => {
  it("auto-allows scoped search requests", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const decision = evaluateWorkerToolRequest(context, {
      id: "req-1",
      action: "search_text",
      reason: "Need evidence.",
      scope: "packages/core",
      query: "value",
      limits: { maxResults: 5 },
      expectedUse: "Find implementation."
    });

    expect(decision).toMatchObject({
      allowed: true,
      mode: "auto-allow",
      requiresUserApproval: false
    });
  });

  it("requires user approval for paths outside the current scope", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const decision = evaluateWorkerToolRequest(context, {
      id: "req-2",
      action: "read_file_snippet",
      reason: "Need adjacent CLI context.",
      scope: "packages/core",
      path: "packages/cli/src/index.ts",
      selector: {
        kind: "line-range",
        startLine: 1,
        endLine: 1
      },
      limits: {},
      expectedUse: "Check caller behavior."
    });

    expect(decision).toMatchObject({
      allowed: false,
      mode: "ask-user",
      requiresUserApproval: true
    });
  });

  it("always denies secret-like paths", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const decision = evaluateWorkerToolRequest(context, {
      id: "req-3",
      action: "read_file_snippet",
      reason: "Need config.",
      path: ".env",
      selector: {
        kind: "line-range",
        startLine: 1,
        endLine: 1
      },
      limits: {},
      expectedUse: "Read config."
    });

    expect(decision).toMatchObject({
      allowed: false,
      mode: "always-deny"
    });
  });

  it("honors explicit user grants for matching scoped requests", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const request = {
      id: "req-4",
      action: "read_file_snippet" as const,
      reason: "Need adjacent CLI context.",
      scope: "packages/core",
      path: "packages/cli/src/index.ts",
      selector: {
        kind: "line-range" as const,
        startLine: 1,
        endLine: 1
      },
      limits: {},
      expectedUse: "Check caller behavior."
    };
    const decision = evaluateWorkerToolRequest(context, request, {
      userGrant: {
        id: "grant-1",
        requestId: "req-4",
        taskId: "task-1",
        action: "read_file_snippet",
        pathPrefix: "packages/cli",
        grantScope: "once",
        granted: true,
        status: "granted",
        decidedAt: new Date().toISOString()
      }
    });

    expect(decision).toMatchObject({
      allowed: true,
      mode: "ask-user",
      requiresUserApproval: false
    });
  });

  it("honors explicit user denials without asking again", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const request = {
      id: "req-5",
      action: "read_file_snippet" as const,
      reason: "Need adjacent CLI context.",
      scope: "packages/core",
      path: "packages/cli/src/index.ts",
      selector: {
        kind: "line-range" as const,
        startLine: 1,
        endLine: 1
      },
      limits: {},
      expectedUse: "Check caller behavior."
    };
    const decision = evaluateWorkerToolRequest(context, request, {
      userGrant: {
        id: "grant-2",
        requestId: "req-5",
        taskId: "task-1",
        action: "read_file_snippet",
        pathPrefix: "packages/cli",
        grantScope: "once",
        granted: false,
        status: "denied",
        decidedAt: new Date().toISOString()
      }
    });

    expect(decision).toMatchObject({
      allowed: false,
      mode: "always-deny",
      requiresUserApproval: false,
      reason: "User denied this tool request."
    });
  });
});
