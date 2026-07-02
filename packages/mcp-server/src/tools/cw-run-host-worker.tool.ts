import { z } from "zod";

import { UserPermissionGrantSchema } from "@mcp-code-worker/core";
import { runHostWorkerWorkflow } from "@mcp-code-worker/graph";

import {
  CodexHostSurfaceAdapter,
  type CwMcpWorkflowResponse
} from "./host-surface-adapter.js";
import {
  resolveToolContext,
  writeToolAuditEvent
} from "./tool-runtime.js";
import type { CwToolDefinition } from "./tool-types.js";

const continuationTokenSchema = z
  .object({
    taskId: z.string().min(1),
    requestId: z.string().min(1),
    expiresAt: z.string().datetime()
  })
  .strict();

const inputSchema = z.object({
  continuationToken: continuationTokenSchema.optional(),
  files: z.array(z.string()).optional(),
  forceExecution: z.boolean().optional(),
  goal: z.string().min(1),
  scope: z.string().optional(),
  strictFiles: z.boolean().optional(),
  taskType: z.enum([
    "summarization",
    "code-understanding",
    "review-lite",
    "risk-analysis",
    "codegen",
    "test-generation",
    "validation-fix",
    "log-analysis",
    "json-extraction",
    "doc-generation"
  ]),
  userPermissionGrants: z.array(UserPermissionGrantSchema).optional(),
  workerId: z.string().min(1),
  requireProfile: z.boolean().optional()
});

export const cwRunHostWorkerTool: CwToolDefinition<
  typeof inputSchema.shape,
  CwMcpWorkflowResponse
> = {
  name: "cw_run_host_worker",
  description:
    "Run one explicit worker task under host control without introducing another decision-making surface.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveToolContext();
    const forceExecution =
      args.forceExecution ?? (args.requireProfile !== true && context.dryRun);
    const result = await runHostWorkerWorkflow({
      context,
      files: args.files,
      forceExecution,
      goal: args.goal,
      requireProfile: args.requireProfile,
      scope: args.scope,
      strictFiles: args.strictFiles,
      taskId: args.continuationToken?.taskId,
      taskType: args.taskType,
      userPermissionGrants: args.userPermissionGrants,
      workerId: args.workerId
    });
    const response = CodexHostSurfaceAdapter.renderWorkflowResult(result);
    await writeToolAuditEvent({
      context,
      tool: "cw_run_host_worker",
      inputSummary: args.goal,
      outputSummary: `Host-managed worker MCP workflow completed with status ${response.status}.`,
      warnings: result.warnings,
      errors: result.errors,
      metadata: {
        continuationRequestId: args.continuationToken?.requestId,
        continuationTaskId: args.continuationToken?.taskId,
        files: args.files,
        forceExecution,
        requireProfile: args.requireProfile,
        scope: args.scope,
        strictFiles: args.strictFiles,
        taskType: args.taskType,
        userPermissionGrantCount: args.userPermissionGrants?.length ?? 0,
        workerId: args.workerId
      }
    });
    return response;
  }
};
