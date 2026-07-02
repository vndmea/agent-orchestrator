import { relative } from "node:path";

import type {
  ExecutionContext,
  UserPermissionGrant,
  WorkerToolPermissionDecision,
  WorkerToolRequest,
  WorkerToolRequestAction
} from "@mcp-code-worker/core";

import {
  isRepositoryPathInsideScope,
  resolveRepositoryPath
} from "../repository/file-selection.js";

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/iu,
  /^id_rsa$/iu,
  /^id_ed25519$/iu,
  /\.pem$/iu,
  /\.key$/iu,
  /\.p12$/iu,
  /\.pfx$/iu
];

const DEFAULT_ALLOWED_ACTIONS: WorkerToolRequestAction[] = [
  "search_files",
  "search_text",
  "read_file_snippet",
  "read_git_diff",
  "inspect_patch",
  "run_validation_command"
];

export interface EvaluateWorkerToolRequestOptions {
  interactive?: boolean;
  toolPolicy?: {
    allowedRequests?: WorkerToolRequestAction[];
    deniedRequests?: WorkerToolRequestAction[];
    defaultPermissionMode?: "auto-allow" | "ask-user";
  };
  userGrant?: UserPermissionGrant;
}

const toRepositoryRelativePath = (
  rootDir: string,
  path: string
): string => relative(rootDir, resolveRepositoryPath(rootDir, path)).replaceAll("\\", "/");

const isSecretLikePath = (path: string): boolean => {
  const name = path.split(/[\\/]/u).at(-1)?.toLowerCase() ?? "";
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name));
};

const requestedPaths = (
  context: ExecutionContext,
  request: WorkerToolRequest
): string[] => {
  switch (request.action) {
    case "read_file_snippet":
      return [toRepositoryRelativePath(context.rootDir, request.path)];
    case "search_text":
    case "read_git_diff":
      return (request.paths ?? []).map((path) =>
        toRepositoryRelativePath(context.rootDir, path)
      );
    case "search_files":
    case "inspect_patch":
    case "run_validation_command":
      return [];
  }
};

const block = (
  request: WorkerToolRequest,
  reason: string,
  normalizedPaths: string[] = []
): WorkerToolPermissionDecision => ({
  requestId: request.id,
  mode: "always-deny",
  allowed: false,
  reason,
  normalizedScope: request.scope,
  normalizedPaths,
  riskLevel: "high",
  requiresUserApproval: false
});

const matchesGrant = (
  request: WorkerToolRequest,
  normalizedPaths: string[],
  grant: UserPermissionGrant | undefined
): boolean => {
  if (!grant?.granted || grant.status !== "granted") {
    return false;
  }

  if (grant.requestId !== request.id || grant.action !== request.action) {
    return false;
  }

  if (!grant.pathPrefix) {
    return true;
  }

  return normalizedPaths.every(
    (path) => path === grant.pathPrefix || path.startsWith(`${grant.pathPrefix}/`)
  );
};

const matchesDeniedGrant = (
  request: WorkerToolRequest,
  normalizedPaths: string[],
  grant: UserPermissionGrant | undefined
): boolean => {
  if (!grant || grant.granted || grant.status !== "denied") {
    return false;
  }

  if (grant.requestId !== request.id || grant.action !== request.action) {
    return false;
  }

  if (!grant.pathPrefix) {
    return true;
  }

  return normalizedPaths.every(
    (path) => path === grant.pathPrefix || path.startsWith(`${grant.pathPrefix}/`)
  );
};

const hasScopeEscape = (
  context: ExecutionContext,
  scope: string | undefined,
  paths: string[]
): boolean =>
  paths.some(
    (path) => !isRepositoryPathInsideScope(context.rootDir, path, scope)
  );

export const evaluateWorkerToolRequest = (
  context: ExecutionContext,
  request: WorkerToolRequest,
  options: EvaluateWorkerToolRequestOptions = {}
): WorkerToolPermissionDecision => {
  const deniedRequests = new Set(options.toolPolicy?.deniedRequests ?? []);
  const allowedRequests = new Set(
    options.toolPolicy?.allowedRequests ?? DEFAULT_ALLOWED_ACTIONS
  );
  const normalizedPaths = requestedPaths(context, request);

  if (matchesDeniedGrant(request, normalizedPaths, options.userGrant)) {
    return block(
      request,
      "User denied this tool request.",
      normalizedPaths
    );
  }

  if (deniedRequests.has(request.action) || !allowedRequests.has(request.action)) {
    return block(
      request,
      `Tool request action ${request.action} is not allowed by this task policy.`,
      normalizedPaths
    );
  }

  if (normalizedPaths.some(isSecretLikePath)) {
    return block(
      request,
      "Tool request targets a secret-like file path.",
      normalizedPaths
    );
  }

  if (request.action === "inspect_patch") {
    return {
      requestId: request.id,
      mode: "host-only",
      allowed: true,
      reason: "Patch inspection is host-only and must be executed by the host runtime.",
      normalizedScope: request.scope,
      normalizedPaths,
      riskLevel: "medium",
      requiresUserApproval: false
    };
  }

  if (request.action === "run_validation_command") {
    if (matchesGrant(request, normalizedPaths, options.userGrant)) {
      return {
        requestId: request.id,
        mode: "ask-user",
        allowed: true,
        reason: "User granted this validation command request.",
        normalizedScope: request.scope,
        normalizedPaths,
        riskLevel: "medium",
        requiresUserApproval: false
      };
    }

    return {
      requestId: request.id,
      mode: "ask-user",
      allowed: false,
      reason: "Validation commands require explicit user approval.",
      normalizedScope: request.scope,
      normalizedPaths,
      riskLevel: "medium",
      requiresUserApproval: true
    };
  }

  if (hasScopeEscape(context, request.scope, normalizedPaths)) {
    if (matchesGrant(request, normalizedPaths, options.userGrant)) {
      return {
        requestId: request.id,
        mode: "ask-user",
        allowed: true,
        reason: "User granted access outside the initial task scope.",
        normalizedScope: request.scope,
        normalizedPaths,
        riskLevel: "medium",
        requiresUserApproval: false
      };
    }

    return {
      requestId: request.id,
      mode: "ask-user",
      allowed: false,
      reason: "Tool request reads outside the current task scope.",
      normalizedScope: request.scope,
      normalizedPaths,
      riskLevel: "medium",
      requiresUserApproval: true
    };
  }

  const defaultMode = options.toolPolicy?.defaultPermissionMode ?? "auto-allow";
  const requiresUserApproval = defaultMode === "ask-user" &&
    !matchesGrant(request, normalizedPaths, options.userGrant);

  return {
    requestId: request.id,
    mode: requiresUserApproval ? "ask-user" : "auto-allow",
    allowed: !requiresUserApproval,
    reason: requiresUserApproval
      ? "Task policy requires user approval for this tool request."
      : "Tool request is allowed within the current task scope.",
    normalizedScope: request.scope,
    normalizedPaths,
    riskLevel: request.action === "read_file_snippet" ? "medium" : "low",
    requiresUserApproval
  };
};
