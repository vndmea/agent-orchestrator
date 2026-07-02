import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@mcp-code-worker/core";

import { executeWorkerToolRequest } from "./worker-tool-executor.js";
import { evaluateWorkerToolRequest } from "./worker-tool-permission.js";

const createWorkspace = async (): Promise<string> => {
  const rootDir = await mkdtemp(join(tmpdir(), "cw-worker-tool-exec-"));
  await mkdir(join(rootDir, "packages", "core", "src"), { recursive: true });
  await writeFile(
    join(rootDir, "packages", "core", "src", "index.ts"),
    [
      "export const value = 1;",
      "export const generateId = () => 'id';",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } }),
    "utf8"
  );
  return rootDir;
};

describe("executeWorkerToolRequest", () => {
  it("searches text and returns bounded evidence", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const request = {
      id: "req-1",
      action: "search_text" as const,
      reason: "Need evidence.",
      scope: "packages/core",
      query: "generateId",
      limits: { maxResults: 5 },
      expectedUse: "Find implementation."
    };
    const decision = evaluateWorkerToolRequest(context, request);
    const result = await executeWorkerToolRequest(context, request, decision);

    expect(result.ok).toBe(true);
    expect(result.evidence[0]).toMatchObject({
      path: "packages/core/src/index.ts",
      lineStart: 2
    });
  });

  it("reads line-range snippets", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const request = {
      id: "req-2",
      action: "read_file_snippet" as const,
      reason: "Need exact file context.",
      scope: "packages/core",
      path: "packages/core/src/index.ts",
      selector: {
        kind: "line-range" as const,
        startLine: 1,
        endLine: 1
      },
      limits: {},
      expectedUse: "Cite implementation."
    };
    const decision = evaluateWorkerToolRequest(context, request);
    const result = await executeWorkerToolRequest(context, request, decision);

    expect(result.evidence[0]).toMatchObject({
      lineStart: 1,
      lineEnd: 1,
      snippet: "export const value = 1;"
    });
  });

  it("runs preset validation commands through host policy", async () => {
    const rootDir = await createWorkspace();
    const context = createExecutionContextFromEnv(undefined, {
      rootDir,
      dryRun: true,
      allowWrite: false
    });
    const request = {
      id: "req-3",
      action: "run_validation_command" as const,
      reason: "Need validation output.",
      scope: ".",
      commandId: "typecheck",
      limits: {},
      expectedUse: "Verify typecheck."
    };
    const decision = evaluateWorkerToolRequest(context, request, {
      userGrant: {
        id: "grant-1",
        requestId: "req-3",
        taskId: "task-1",
        action: "run_validation_command",
        grantScope: "once",
        granted: true,
        status: "granted",
        decidedAt: new Date().toISOString()
      }
    });
    const result = await executeWorkerToolRequest(context, request, decision);

    expect(result.ok).toBe(true);
    expect(result.evidence[0]?.metadata).toMatchObject({
      name: "typecheck",
      status: "dry-run"
    });
  });
});
