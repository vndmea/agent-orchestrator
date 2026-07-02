import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";

import { AgentError, resolveExecutionContext } from "@mcp-code-worker/core";
export { cwToolDefinitions } from "./tools/tool-registry.js";
import { cwToolDefinitions } from "./tools/tool-registry.js";

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

export interface StructuredToolErrorContent extends Record<string, unknown> {
  error: {
    code: string;
    details?: unknown;
    message: string;
    nextSteps: string[];
    reason:
      | "configuration"
      | "model_credentials"
      | "not_found"
      | "schema"
      | "safety_policy"
      | "unexpected";
    retryable: boolean;
    technicalMessage: string;
  };
}

const extractWorkerIdFromMessage = (message: string): string | undefined =>
  message.match(/\bWorker\s+([^\s]+)\s+/u)?.[1];

export const toStructuredToolError = (
  error: unknown
): StructuredToolErrorContent => {
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const normalizedMessage = technicalMessage.toLowerCase();
  const userMessage = formatUserFacingToolErrorMessage(error);

  if (error instanceof AgentError) {
    const reason =
      error.code === "TASK_SESSION_NOT_FOUND" ||
      error.code === "TASK_ARTIFACT_NOT_FOUND"
        ? "not_found"
        : error.code === "WRITE_BLOCKED"
          ? "safety_policy"
          : "configuration";

    return {
      error: {
        code: error.code,
        details: error.details,
        message: userMessage,
        nextSteps:
          reason === "not_found"
            ? ["Confirm the task id or artifact name belongs to this workspace."]
            : reason === "safety_policy"
              ? ["Retry with the required explicit write gate only after reviewing the proposed change."]
              : ["Run cw doctor with the same worker and options to inspect the failing prerequisite."],
        reason,
        retryable: reason !== "not_found",
        technicalMessage
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      error: {
        code: "MCP_SCHEMA_VALIDATION_FAILED",
        details: error.issues,
        message: userMessage,
        nextSteps: ["Check the tool input schema and retry with the required fields."],
        reason: "schema",
        retryable: false,
        technicalMessage
      }
    };
  }

  if (
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("401") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden")
  ) {
    const workerId = extractWorkerIdFromMessage(technicalMessage);

    return {
      error: {
        code: "MODEL_CREDENTIALS_UNAVAILABLE",
        message: userMessage,
        nextSteps: [
          workerId
            ? `Fix credentials for worker ${workerId}, then rerun cw worker readiness --worker ${workerId} --probe.`
            : "Fix the configured model credentials, then rerun cw doctor --probe."
        ],
        reason: "model_credentials",
        retryable: true,
        technicalMessage
      }
    };
  }

  if (
    normalizedMessage.includes("config.json") ||
    normalizedMessage.includes("workspaces") ||
    normalizedMessage.includes("configuration")
  ) {
    return {
      error: {
        code: "CW_CONFIGURATION_ERROR",
        message: userMessage,
        nextSteps: ["Run cw doctor to inspect workspace and user-scoped configuration."],
        reason: "configuration",
        retryable: true,
        technicalMessage
      }
    };
  }

  return {
    error: {
      code: "CW_TOOL_UNEXPECTED_ERROR",
      message: userMessage,
      nextSteps: ["Retry after checking cw doctor; report the technical message if it persists."],
      reason: "unexpected",
      retryable: true,
      technicalMessage
    }
  };
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
          const parsedArgs = tool.inputSchema.parse(args);
          const result = await tool.execute(parsedArgs);
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
          const structuredContent = toStructuredToolError(error);

          return {
            content: [
              {
                type: "text" as const,
                text: structuredContent.error.message
              }
            ],
            isError: true,
            structuredContent
          };
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
