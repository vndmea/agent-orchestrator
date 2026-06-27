import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";

import { AgentError, resolveExecutionContext } from "@mcp-code-worker/core";

import { cwBenchmarkWorkerTool } from "./tools/cw-benchmark-worker.tool.js";
import { cwDoctorTool } from "./tools/cw-doctor.tool.js";
import { cwApplyPatchTool } from "./tools/cw-apply-patch.tool.js";
import { cwFixErrorTool } from "./tools/cw-fix-error.tool.js";
import { cwGetTaskReportTool } from "./tools/cw-get-task-report.tool.js";
import { cwGetTaskStatusTool } from "./tools/cw-get-task-status.tool.js";
import { cwReadTaskArtifactTool } from "./tools/cw-read-task-artifact.tool.js";
import { cwGetWorkerRegistrationTool } from "./tools/cw-get-worker-registration.tool.js";
import { cwGetWorkerProfileTool } from "./tools/cw-get-worker-profile.tool.js";
import { cwInspectPatchTool } from "./tools/cw-inspect-patch.tool.js";
import {
  cwInterviewWorkerTool,
  cwRunWorkerInterviewTool
} from "./tools/cw-interview-worker.tool.js";
import { cwListAuditEventsTool } from "./tools/cw-list-audit-events.tool.js";
import { cwListModelsTool } from "./tools/cw-list-models.tool.js";
import { cwListTasksTool } from "./tools/cw-list-tasks.tool.js";
import { cwListToolsTool } from "./tools/cw-list-tools.tool.js";
import { cwListWorkerRegistryTool } from "./tools/cw-list-worker-registry.tool.js";
import { cwListWorkersTool } from "./tools/cw-list-workers.tool.js";
import { cwListWorkflowsTool } from "./tools/cw-list-workflows.tool.js";
import { cwProposePatchTool } from "./tools/cw-propose-patch.tool.js";
import { cwRegisterWorkerTool } from "./tools/cw-register-worker.tool.js";
import { cwReviewDiffTool } from "./tools/cw-review-diff.tool.js";
import { cwReviewFilesTool } from "./tools/cw-review-files.tool.js";
import { cwReviewRepositoryTool } from "./tools/cw-review-repository.tool.js";
import { cwResumeTaskTool } from "./tools/cw-resume-task.tool.js";
import { cwRunHostWorkerTool } from "./tools/cw-run-host-worker.tool.js";
import { cwStartTaskTool } from "./tools/cw-start-task.tool.js";
import { cwUnregisterWorkerTool } from "./tools/cw-unregister-worker.tool.js";
import { cwValidateRepositoryTool } from "./tools/cw-validate-repository.tool.js";

export const cwToolDefinitions = [
  cwRunHostWorkerTool,
  cwProposePatchTool,
  cwInspectPatchTool,
  cwApplyPatchTool,
  cwReviewRepositoryTool,
  cwReviewDiffTool,
  cwReviewFilesTool,
  cwValidateRepositoryTool,
  cwFixErrorTool,
  cwStartTaskTool,
  cwResumeTaskTool,
  cwGetTaskStatusTool,
  cwListTasksTool,
  cwGetTaskReportTool,
  cwReadTaskArtifactTool,
  cwListModelsTool,
  cwListWorkflowsTool,
  cwListToolsTool,
  cwListAuditEventsTool,
  cwRegisterWorkerTool,
  cwUnregisterWorkerTool,
  cwListWorkerRegistryTool,
  cwGetWorkerRegistrationTool,
  cwRunWorkerInterviewTool,
  cwInterviewWorkerTool,
  cwBenchmarkWorkerTool,
  cwListWorkersTool,
  cwGetWorkerProfileTool,
  cwDoctorTool
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const toStructuredContent = (result: unknown): Record<string, unknown> =>
  isPlainObject(result) ? result : { result };

export const formatUserFacingToolErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (error instanceof AgentError) {
    const userMessage =
      error.code === "TASK_SESSION_NOT_FOUND"
        ? "cw is connected to this workspace, but the requested task session was not found here."
        : error.code === "TASK_ARTIFACT_NOT_FOUND"
          ? "cw found the task session, but this artifact is not registered for it, so it cannot be read safely."
          : error.code === "TASK_PATCH_PROPOSAL_MISSING"
            ? "This step needs a stored patch proposal before it can continue."
            : error.code === "WRITE_BLOCKED"
              ? "cw refused to write because the current safety mode does not allow that path yet."
              : "cw reached the tool, but the request could not be completed cleanly.";

    return `${userMessage} Technical details: ${message}`;
  }

  if (error instanceof ZodError) {
    return `The service is connected, but the request or response shape does not match the expected schema. Technical details: ${message}`;
  }

  if (
    normalizedMessage.includes("expected record") &&
    normalizedMessage.includes("received array")
  ) {
    return `The service is connected, but this response format is incompatible with the current client expectation. Technical details: ${message}`;
  }

  if (
    (normalizedMessage.includes("config.json") ||
      normalizedMessage.includes("workspaces") ||
      normalizedMessage.includes("configuration")) &&
    (normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("missing") ||
      normalizedMessage.includes("parse"))
  ) {
    return `The service is connected, but cw found a workspace or user-scoped storage configuration problem. Technical details: ${message}`;
  }

  if (
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("401") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden")
  ) {
    return `The service is connected, but the configured model credentials were rejected or are incomplete. Technical details: ${message}`;
  }

  return `cw reached the tool, but it failed unexpectedly. Technical details: ${message}`;
};

const toUserFacingToolError = (error: unknown): Error => {
  return new Error(formatUserFacingToolErrorMessage(error));
};

export interface CwMcpServerOptions {
  rootDir?: string;
}

export const createCwMcpServer = async (
  options: CwMcpServerOptions = {}
) => {
  const context = await resolveExecutionContext({
    ...(options.rootDir ? { rootDir: options.rootDir } : {})
  });
  const server = new McpServer({
    name: context.serverName,
    version: context.serverVersion
  });

  cwToolDefinitions.forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (args: unknown) => {
        try {
          const result = await tool.execute(args as never);
          const structuredContent = toStructuredContent(result);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2)
              }
            ],
            structuredContent
          };
        } catch (error) {
          throw toUserFacingToolError(error);
        }
      }
    );
  });

  return server;
};

export const serveCwMcpServer = async (
  options: CwMcpServerOptions = {}
): Promise<void> => {
  const server = await createCwMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
