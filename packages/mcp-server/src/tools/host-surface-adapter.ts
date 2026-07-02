import type {
  UserPermissionGrant,
  WorkerToolPermissionDecision,
  WorkerToolRequest,
  WorkerToolResult
} from "@mcp-code-worker/core";
import type {
  HostWorkerWorkflowOutput,
  HostWorkerWorkflowStatus
} from "@mcp-code-worker/graph";

export type CwMcpWorkflowStatus =
  | "completed"
  | "needs_review"
  | "permission_required"
  | "blocked"
  | "invalid_output"
  | "host_takeover";

export interface PermissionContinuationToken {
  taskId: string;
  requestId: string;
  expiresAt: string;
}

export interface CwMcpPermissionRequest {
  continuationToken: PermissionContinuationToken;
  decision: WorkerToolPermissionDecision;
  request: WorkerToolRequest;
  userPrompt: string;
}

export interface CwMcpWorkflowResponse {
  status: CwMcpWorkflowStatus;
  result?: HostWorkerWorkflowOutput;
  permissionRequest?: CwMcpPermissionRequest;
  toolResults?: WorkerToolResult[];
  diagnostics: {
    auditEventIds?: string[];
    taskId?: string;
    toolRounds?: number;
    workerExecutionRecordId?: string;
    workerId?: string;
  };
}

export interface HostSurfaceAdapter {
  id: string;
  parseUserPermissionResponse(response: unknown): UserPermissionGrant;
  renderPermissionRequest(
    request: WorkerToolRequest,
    decision: WorkerToolPermissionDecision,
    taskId: string
  ): CwMcpPermissionRequest;
  renderToolError(error: unknown): Record<string, unknown>;
  renderToolResult(result: WorkerToolResult): WorkerToolResult;
  renderWorkflowResult(result: HostWorkerWorkflowOutput): CwMcpWorkflowResponse;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};

const asStatus = (status: HostWorkerWorkflowStatus): CwMcpWorkflowStatus =>
  status;

const getToolRounds = (
  result: HostWorkerWorkflowOutput
): number | undefined => {
  const rounds = result.workerResult?.metadata.toolRounds;

  return typeof rounds === "number" && Number.isFinite(rounds)
    ? rounds
    : undefined;
};

const getWorkerExecutionRecordId = (
  result: HostWorkerWorkflowOutput
): string | undefined => {
  const recordId = result.finalResult.metadata.workerExecutionRecordId;

  return typeof recordId === "string" ? recordId : undefined;
};

const getPermissionRequest = (
  result: HostWorkerWorkflowOutput
):
  | {
      decision: WorkerToolPermissionDecision;
      request: WorkerToolRequest;
    }
  | undefined => {
  const output = asRecord(result.finalResult.output);
  const permissionRequest = asRecord(output.permissionRequest);
  const decision = permissionRequest.decision;
  const request = permissionRequest.request;

  return decision && request
    ? {
        decision: decision as WorkerToolPermissionDecision,
        request: request as WorkerToolRequest
      }
    : undefined;
};

const buildContinuationToken = (
  taskId: string,
  requestId: string
): PermissionContinuationToken => {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    taskId,
    requestId,
    expiresAt
  };
};

const buildUserPrompt = (
  request: WorkerToolRequest,
  decision: WorkerToolPermissionDecision
): string => {
  const paths = decision.normalizedPaths.length > 0
    ? ` Paths: ${decision.normalizedPaths.join(", ")}.`
    : "";

  return `Worker requests ${request.action}: ${request.reason}.${paths} ${decision.reason}`;
};

export const CodexHostSurfaceAdapter: HostSurfaceAdapter = {
  id: "codex",
  parseUserPermissionResponse: (response) =>
    response as UserPermissionGrant,
  renderPermissionRequest: (request, decision, taskId) => ({
    continuationToken: buildContinuationToken(taskId, request.id),
    decision,
    request,
    userPrompt: buildUserPrompt(request, decision)
  }),
  renderToolError: (error) => ({
    message: error instanceof Error ? error.message : String(error)
  }),
  renderToolResult: (result) => result,
  renderWorkflowResult: (result) => {
    const permissionRequest = getPermissionRequest(result);
    const status = permissionRequest
      ? "permission_required"
      : asStatus(result.qualityGate.workflowStatus);

    return {
      status,
      result,
      ...(permissionRequest
        ? {
            permissionRequest:
              CodexHostSurfaceAdapter.renderPermissionRequest(
                permissionRequest.request,
                permissionRequest.decision,
                result.finalResult.taskId
              )
          }
        : {}),
      toolResults: result.workerResult?.metadata.toolResults as
        | WorkerToolResult[]
        | undefined,
      diagnostics: {
        taskId: result.finalResult.taskId,
        toolRounds: getToolRounds(result),
        workerExecutionRecordId: getWorkerExecutionRecordId(result),
        workerId:
          typeof result.finalResult.metadata.workerId === "string"
            ? result.finalResult.metadata.workerId
            : undefined
      }
    };
  }
};
