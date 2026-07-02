import type {
  AgentResult,
  AgentTask,
  ExecutionContext,
  RepositoryContextPack,
  WorkerCapabilityProfile,
  UserPermissionGrant,
  WorkerToolPermissionDecision,
  WorkerToolRequest,
  WorkerToolResult,
  WorkerResultEnvelope,
  WorkerResultStatus,
  WorkerTaskType
} from "@mcp-code-worker/core";
import {
  recordWorkerTaskExecution,
  resolveExecutionContext,
  ValidationReportSchema,
  writeAuditEvent
} from "@mcp-code-worker/core";
import {
  assessWorkerTaskEligibility
} from "@mcp-code-worker/models";
import {
  buildRepositoryContextPack,
  evaluateWorkerToolRequest,
  executeWorkerToolRequest
} from "@mcp-code-worker/tools";

import { CodexHostAdapter } from "../host/codex-host-adapter.js";
import {
  runHostSemanticValidation,
  type HostSemanticFailureStage
} from "../validators/host-semantic-validator.js";
import { CodegenWorker } from "../workers/codegen-worker.js";
import { ReviewWorker } from "../workers/review-worker.js";
import { SummarizeWorker } from "../workers/summarize-worker.js";
import { TestWorker } from "../workers/test-worker.js";
import { resolveWorkflowWorkerContext } from "./worker-context-resolution.js";
import { resolveWorkerCapabilityProfileForExecution } from "./worker-onboarding-workflow.js";
import { buildWorkerTrustProfile } from "./worker-trust-profile.js";
import { runPatchProposalWorkflow } from "./patch-proposal-workflow.js";

export interface HostWorkerWorkflowInput {
  additionalTaskInput?: Record<string, unknown>;
  context?: ExecutionContext;
  files?: string[];
  forceExecution?: boolean;
  goal: string;
  repositoryContext?: RepositoryContextPack;
  requireProfile?: boolean;
  scope?: string;
  strictFiles?: boolean;
  taskId?: string;
  taskType: WorkerTaskType;
  userPermissionGrants?: UserPermissionGrant[];
  workerCapabilityProfile?: WorkerCapabilityProfile | null;
  workerId?: string;
}

export type HostWorkerFailureStage =
  | "worker-blocked-by-policy"
  | "worker-not-run"
  | HostSemanticFailureStage
  | "worker-provider-failure"
  | "worker-json-parse-failure"
  | "worker-schema-validation-failure"
  | "unknown";

export type HostWorkerExecutionState =
  | "blocked_by_policy"
  | "not_executed"
  | "executed";

export type StructuredOutputStatus =
  | "not-attempted"
  | "valid"
  | "invalid";

export type HostWorkerWorkflowStatus =
  | "completed"
  | "needs_review"
  | "permission_required"
  | "blocked"
  | "invalid_output"
  | "host_takeover";

export interface HostWorkerExecutionInfo {
  allowedByPolicy: boolean;
  forceExecution: boolean;
  overrideApplied: boolean;
  policyReason: string;
  requiresHostReview: boolean;
  state: HostWorkerExecutionState;
}

export interface HostWorkerWorkflowQualityGate {
  answered: boolean;
  answerStatus: "complete" | "incomplete";
  coverageGapDetected: boolean;
  execution: HostWorkerExecutionInfo;
  failureStages: HostWorkerFailureStage[];
  genericFallbackDetected: boolean;
  mentionedFiles: string[];
  missingRequestedFiles: string[];
  requiresHostReview: boolean;
  resultStatus: WorkerResultStatus;
  skippedFiles: string[];
  reasons: string[];
  structuredFailureKind:
    | "provider-invocation"
    | "json-parse"
    | "schema-validation"
    | null;
  structuredOutputAttempts: number;
  structuredOutputOk: boolean;
  structuredOutputStatus: StructuredOutputStatus;
  templateFallbackDetected: boolean;
  workflowStatus: HostWorkerWorkflowStatus;
}

export interface HostWorkerWorkflowOutput {
  debug: {
    qualityGate: {
      answerStatus: "complete" | "incomplete";
      coverageGapDetected: boolean;
      execution: HostWorkerExecutionInfo;
      failureStages: HostWorkerFailureStage[];
      reasons: string[];
      resultStatus: WorkerResultStatus;
      structuredFailureKind:
        | "provider-invocation"
        | "json-parse"
        | "schema-validation"
        | null;
      structuredOutputAttempts: number;
      structuredOutputOk: boolean;
      structuredOutputStatus: StructuredOutputStatus;
      workflowStatus: HostWorkerWorkflowStatus;
    };
    promptTransparency: {
      hostPrompt: string;
      promptTransformation: "preserved" | "augmented";
      workerPrompt: string | null;
    };
    repositoryContext: {
      requestedFiles: string[];
      skippedFiles: string[];
      scope?: string;
      selectedFiles: string[];
      coverageGapDetected: boolean;
      strictFiles: boolean;
      warnings: string[];
    };
    workerExecution: HostWorkerExecutionInfo;
    worker: {
      artifacts: AgentResult["artifacts"];
      metadata: Record<string, unknown>;
      output: unknown;
      status: AgentResult["status"];
    } | null;
  };
  execution: HostWorkerExecutionInfo;
  errors: string[];
  finalResult: AgentResult;
  qualityGate: HostWorkerWorkflowQualityGate;
  repositoryContext: RepositoryContextPack;
  warnings: string[];
  workerCapabilityProfile: WorkerCapabilityProfile | null;
  workerResult: AgentResult | null;
}

const asFailureKind = (
  value: unknown
):
  | "provider-invocation"
  | "json-parse"
  | "schema-validation"
  | null =>
  value === "provider-invocation" ||
  value === "json-parse" ||
  value === "schema-validation"
    ? value
    : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asWorkerToolInterruption = (
  value: unknown
):
  | {
      decision: WorkerToolPermissionDecision;
      request: WorkerToolRequest;
    }
  | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as {
    decision?: unknown;
    request?: unknown;
  };

  return candidate.decision && candidate.request
    ? candidate as {
        decision: WorkerToolPermissionDecision;
        request: WorkerToolRequest;
      }
    : undefined;
};

const getValidationReportFromInput = (input: HostWorkerWorkflowInput) => {
  const parsed = ValidationReportSchema.safeParse(
    input.additionalTaskInput?.validationReport
  );

  return parsed.success ? parsed.data : undefined;
};

const resolveWorkerResultStatus = (input: {
  execution: HostWorkerExecutionInfo;
  semanticStatus: WorkerResultStatus;
  structuredOutputOk: boolean;
  workerResult: AgentResult | null;
}): WorkerResultStatus => {
  if (input.execution.state === "blocked_by_policy") {
    return "blocked";
  }

  if (input.execution.state !== "executed") {
    return "host_takeover";
  }

  if (!input.structuredOutputOk || input.workerResult?.status === "failure") {
    return "invalid_output";
  }

  return input.semanticStatus;
};

const buildQualityGate = (
  input: HostWorkerWorkflowInput,
  repositoryContext: RepositoryContextPack,
  execution: HostWorkerExecutionInfo,
  workerResult: AgentResult | null
): HostWorkerWorkflowQualityGate => {
  const structuredOutputOk =
    workerResult?.metadata.structuredOutputOk === true;
  const structuredFailureKind = asFailureKind(workerResult?.metadata.failureKind);
  const structuredOutputAttempts =
    execution.state === "executed"
      ? asNumber(workerResult?.metadata.structuredOutputAttempts) ?? 0
      : 0;
  const structuredOutputStatus: StructuredOutputStatus =
    execution.state !== "executed"
      ? "not-attempted"
      : structuredOutputOk
        ? "valid"
        : "invalid";
  const semanticValidation = runHostSemanticValidation({
    executionState: execution.state,
    repositoryContext,
    requestedFiles: input.files ?? [],
    taskType: input.taskType,
    validationReport: getValidationReportFromInput(input),
    workerResult
  });
  const resultStatus = resolveWorkerResultStatus({
    execution,
    semanticStatus: semanticValidation.resultStatus,
    structuredOutputOk,
    workerResult
  });
  const permissionRequest = asWorkerToolInterruption(
    workerResult?.metadata.permissionRequest
  );
  const deniedToolRequest = asWorkerToolInterruption(
    workerResult?.metadata.deniedToolRequest
  );
  const maxToolRoundsExceeded =
    workerResult?.metadata.maxToolRoundsExceeded === true;
  const reasons: string[] = [];
  const failureStages = new Set<HostWorkerFailureStage>();

  if (execution.state === "blocked_by_policy") {
    reasons.push(`Worker execution was blocked by policy: ${execution.policyReason}`);
    failureStages.add("worker-blocked-by-policy");
  } else if (execution.state !== "executed") {
    reasons.push("Worker was not executed.");
    failureStages.add("worker-not-run");
  }

  if (execution.state === "executed" && !structuredOutputOk) {
    if (structuredFailureKind === "provider-invocation") {
      reasons.push("Worker execution failed during provider invocation.");
      failureStages.add("worker-provider-failure");
    } else if (structuredFailureKind === "json-parse") {
      reasons.push("Worker executed but did not return parseable JSON.");
      failureStages.add("worker-json-parse-failure");
    } else {
      reasons.push("Worker executed but did not return schema-valid structured output.");
      failureStages.add("worker-schema-validation-failure");
    }
  }

  for (const issue of semanticValidation.issues) {
    reasons.push(issue.reason);
    failureStages.add(issue.stage);
  }

  if (permissionRequest) {
    reasons.push(permissionRequest.decision.reason);
  }

  if (deniedToolRequest) {
    reasons.push(`Tool request was denied: ${deniedToolRequest.decision.reason}`);
    failureStages.add("unknown");
  }

  if (maxToolRoundsExceeded) {
    reasons.push("Worker exceeded the maximum host-mediated tool request rounds.");
    failureStages.add("unknown");
  }

  if (
    failureStages.size === 0 &&
    execution.state === "executed" &&
    !structuredOutputOk
  ) {
    failureStages.add("unknown");
  }

  const answered = reasons.length === 0;
  const resolvedResultStatus: WorkerResultStatus = permissionRequest
    ? "tool_request"
    : deniedToolRequest
      ? "blocked"
      : maxToolRoundsExceeded
        ? "host_takeover"
        : resultStatus;
  const workflowStatus: HostWorkerWorkflowStatus = permissionRequest
    ? "permission_required"
    : maxToolRoundsExceeded || resolvedResultStatus === "host_takeover"
      ? "host_takeover"
      : resolvedResultStatus === "blocked"
        ? "blocked"
        : resolvedResultStatus === "invalid_output"
          ? "invalid_output"
          : execution.state === "executed"
            ? "completed"
            : "needs_review";
  const requiresHostReview =
    execution.requiresHostReview ||
    execution.state !== "executed" ||
    workerResult?.status !== "success" ||
    !answered ||
    workflowStatus !== "completed";

  return {
    answered,
    answerStatus: answered ? "complete" : "incomplete",
    coverageGapDetected: semanticValidation.coverageGapDetected,
    execution,
    failureStages: Array.from(failureStages),
    genericFallbackDetected: semanticValidation.genericFallbackDetected,
    mentionedFiles: semanticValidation.mentionedFiles,
    missingRequestedFiles: semanticValidation.missingRequestedFiles,
    requiresHostReview,
    resultStatus: resolvedResultStatus,
    skippedFiles: semanticValidation.skippedFiles,
    reasons,
    structuredFailureKind,
    structuredOutputAttempts,
    structuredOutputOk,
    structuredOutputStatus,
    templateFallbackDetected: semanticValidation.templateFallbackDetected,
    workflowStatus
  };
};

const resolveWorkerAgent = (
  taskType: Exclude<WorkerTaskType, "patch-generation">,
  context: ExecutionContext
) => {
  switch (taskType) {
    case "summarization":
    case "log-analysis":
    case "json-extraction":
    case "doc-generation":
      return new SummarizeWorker(context);
    case "review-lite":
    case "risk-analysis":
    case "code-understanding":
      return new ReviewWorker(context);
    case "codegen":
    case "validation-fix":
      return new CodegenWorker(context);
    case "test-generation":
      return new TestWorker(context);
  }
};

const resolveProfile = async (
  input: HostWorkerWorkflowInput,
  workerContext: ExecutionContext,
  workerId: string
): Promise<{ profile: WorkerCapabilityProfile; warnings: string[] }> => {
  return resolveWorkerCapabilityProfileForExecution({
    providedProfile: input.workerCapabilityProfile,
    requireProfile: input.requireProfile,
    workerContext,
    workerId
  });
};

const asStructuredOutputMode = (
  value: unknown
): WorkerResultEnvelope["diagnostics"]["structuredOutputMode"] =>
  value === "native-json-schema" ||
  value === "prompt-only-json" ||
  value === "none"
    ? value
    : "none";

const buildWorkerResultEnvelope = (input: {
  execution: HostWorkerExecutionInfo;
  qualityGate: HostWorkerWorkflowQualityGate;
  taskType: WorkerTaskType;
  taskEnvelopeId: string;
  workerResult: AgentResult | null;
}): WorkerResultEnvelope => {
  const failure: WorkerResultEnvelope["failure"] | undefined =
    input.qualityGate.reasons.length === 0
      ? undefined
      : input.execution.state === "blocked_by_policy"
        ? {
            kind: "policy-blocked",
            reasons: input.qualityGate.reasons
          }
        : input.qualityGate.structuredFailureKind
          ? {
              kind: input.qualityGate.structuredFailureKind,
              reasons: input.qualityGate.reasons
            }
          : {
              kind: "semantic-validation",
              reasons: input.qualityGate.reasons
            };

  return {
    taskEnvelopeId: input.taskEnvelopeId,
    taskType: input.taskType,
    status: input.qualityGate.resultStatus,
    output: input.workerResult?.output,
    failure,
    diagnostics: {
      modelBehaviorProfile:
        typeof input.workerResult?.metadata.modelBehaviorProfile === "string"
          ? input.workerResult.metadata.modelBehaviorProfile
          : undefined,
      structuredOutputAttempts: input.qualityGate.structuredOutputAttempts,
      structuredOutputFallbackReason:
        typeof input.workerResult?.metadata.structuredOutputFallbackReason === "string"
          ? input.workerResult.metadata.structuredOutputFallbackReason
          : undefined,
      structuredOutputMode:
        input.qualityGate.structuredOutputStatus === "not-attempted"
          ? "none"
          : asStructuredOutputMode(input.workerResult?.metadata.structuredOutputMode),
      toolRounds:
        typeof input.workerResult?.metadata.toolRounds === "number"
          ? input.workerResult.metadata.toolRounds
          : undefined
    },
    toolRequests: Array.isArray(input.workerResult?.metadata.toolRequests)
      ? input.workerResult.metadata.toolRequests as WorkerToolRequest[]
      : undefined,
    toolResults: Array.isArray(input.workerResult?.metadata.toolResults)
      ? input.workerResult.metadata.toolResults as WorkerToolResult[]
      : undefined
  };
};

const getWorkerToolRequests = (
  workerResult: AgentResult | null
): WorkerToolRequest[] =>
  Array.isArray(workerResult?.metadata.toolRequests)
    ? workerResult.metadata.toolRequests as WorkerToolRequest[]
    : [];

const findGrantForRequest = (
  grants: UserPermissionGrant[] | undefined,
  request: WorkerToolRequest,
  taskId: string
): UserPermissionGrant | undefined =>
  grants?.find(
    (grant) => {
      if (
        grant.taskId !== taskId ||
        grant.requestId !== request.id ||
        grant.action !== request.action
      ) {
        return false;
      }

      if (grant.status !== "granted" && grant.status !== "denied") {
        return false;
      }

      if (!grant.expiresAt) {
        return true;
      }

      return Date.parse(grant.expiresAt) > Date.now();
    }
  );

const withToolResults = (
  task: AgentTask,
  workerToolResults: WorkerToolResult[]
): AgentTask => ({
  ...task,
  input: {
    ...(task.input && typeof task.input === "object" ? task.input : {}),
    workerToolResults
  }
});

const buildDeniedToolResult = (
  request: WorkerToolRequest,
  decision: WorkerToolPermissionDecision
): WorkerToolResult => ({
  requestId: request.id,
  action: request.action,
  ok: false,
  summary: decision.reason,
  evidence: [],
  truncated: false,
  warnings: [decision.reason]
});

const runWorkerWithToolLoop = async (input: {
  baseTask: AgentTask;
  context: ExecutionContext;
  hostTask: ReturnType<CodexHostAdapter["buildWorkerTask"]>;
  notes: string[];
  plannedTask: ReturnType<CodexHostAdapter["buildWorkerTask"]>["plannedTask"];
  repositoryContext: RepositoryContextPack;
  scope?: string;
  userPermissionGrants?: UserPermissionGrant[];
  worker: ReturnType<typeof resolveWorkerAgent>;
  workerProfile: WorkerCapabilityProfile;
  allowUnqualifiedExecution: boolean;
}): Promise<{
  permissionRequest?: {
    decision: WorkerToolPermissionDecision;
    request: WorkerToolRequest;
  };
  toolResults: WorkerToolResult[];
  workerResult: AgentResult;
}> => {
  const toolResults: WorkerToolResult[] = [];
  const maxToolRounds = input.hostTask.envelope.toolPolicy?.maxToolRounds ?? 0;
  let completedToolRounds = 0;
  let workerResult = await input.worker.execute({
    allowUnqualifiedExecution: input.allowUnqualifiedExecution,
    task: input.baseTask,
    plannedTask: input.plannedTask,
    scope: input.repositoryContext.scope,
    workerProfile: input.workerProfile,
    notes: input.notes
  });

  for (let round = 0; round < maxToolRounds; round += 1) {
    const requests = getWorkerToolRequests(workerResult);
    if (requests.length === 0) {
      break;
    }

    for (const request of requests) {
      const decision = evaluateWorkerToolRequest(input.context, request, {
        toolPolicy: input.hostTask.envelope.toolPolicy,
        userGrant: findGrantForRequest(
          input.userPermissionGrants,
          request,
          input.hostTask.envelope.id
        )
      });

      if (!decision.allowed && decision.requiresUserApproval) {
        return {
          permissionRequest: {
            decision,
            request
          },
          toolResults,
          workerResult: {
            ...workerResult,
            metadata: {
              ...workerResult.metadata,
              permissionRequest: {
                decision,
                request
              },
              toolRounds: round,
              toolResults
            }
          }
        };
      }

      if (!decision.allowed) {
        const deniedResult = buildDeniedToolResult(request, decision);
        toolResults.push(deniedResult);

        return {
          toolResults,
          workerResult: {
            ...workerResult,
            metadata: {
              ...workerResult.metadata,
              deniedToolRequest: {
                decision,
                request
              },
              toolRounds: completedToolRounds,
              toolResults
            }
          }
        };
      }

      const result = await executeWorkerToolRequest(
        input.context,
        request,
        decision
      );
      toolResults.push(result);
    }

    completedToolRounds = round + 1;
    workerResult = await input.worker.execute({
      allowUnqualifiedExecution: input.allowUnqualifiedExecution,
      task: withToolResults(input.baseTask, toolResults),
      plannedTask: input.plannedTask,
      scope: input.repositoryContext.scope,
      workerProfile: input.workerProfile,
      notes: [
        ...input.notes,
        `Host tool rounds completed: ${round + 1}`
      ]
    });
  }

  const pendingRequests = getWorkerToolRequests(workerResult);
  if (pendingRequests.length > 0) {
    return {
      toolResults,
      workerResult: {
        ...workerResult,
        metadata: {
          ...workerResult.metadata,
          maxToolRoundsExceeded: true,
          toolRounds: completedToolRounds,
          toolResults
        }
      }
    };
  }

  return {
    toolResults,
    workerResult: {
      ...workerResult,
      metadata: {
        ...workerResult.metadata,
        toolRounds: completedToolRounds,
        toolResults
      }
    }
  };
};

const runPatchGenerationThroughHostWorker = async (
  input: HostWorkerWorkflowInput
): Promise<HostWorkerWorkflowOutput> => {
  const context = input.context ?? await resolveExecutionContext();
  const patchResult = await runPatchProposalWorkflow({
    context,
    errorLog:
      typeof input.additionalTaskInput?.errorLog === "string"
        ? input.additionalTaskInput.errorLog
        : undefined,
    fixResult: input.additionalTaskInput?.fixResult,
    goal: input.goal,
    repositoryContext: input.repositoryContext,
    requireProfile: input.requireProfile,
    reviewResult: input.additionalTaskInput?.reviewResult,
    scope: input.scope,
    validationReport: getValidationReportFromInput(input),
    workerId: input.workerId
  });
  const repositoryContext = patchResult.repositoryContext;
  const resolvedWorker = await resolveWorkflowWorkerContext({
    activity: "host-managed patch generation",
    context,
    workerId: input.workerId
  });
  const resolvedWorkerId = resolvedWorker.workerId;
  const execution: HostWorkerExecutionInfo = {
    allowedByPolicy: patchResult.inspection.ok,
    forceExecution: false,
    overrideApplied: false,
    policyReason: patchResult.inspection.ok
      ? "Patch generation completed and inspection passed."
      : patchResult.inspection.blockedReasons[0] ??
        patchResult.warnings[0] ??
        "Patch generation requires host review.",
    requiresHostReview: !patchResult.inspection.ok,
    state: patchResult.proposal.title.includes("[PLACEHOLDER]")
      ? "blocked_by_policy"
      : "executed"
  };
  const structuredOutputOk =
    !patchResult.proposal.title.includes("[PLACEHOLDER]");
  const reasons = [
    ...patchResult.inspection.blockedReasons,
    ...patchResult.semanticValidation.issues.map((issue) => issue.reason)
  ];
  const uniqueReasons = [...new Set(reasons)];
  const failureStages = [
    ...new Set<HostWorkerFailureStage>(
      patchResult.semanticValidation.issues.map((issue) => issue.stage)
    )
  ];

  if (execution.state === "blocked_by_policy") {
    failureStages.unshift("worker-blocked-by-policy");
  }

  const qualityGate: HostWorkerWorkflowQualityGate = {
    answered: patchResult.inspection.ok && uniqueReasons.length === 0,
    answerStatus:
      patchResult.inspection.ok && uniqueReasons.length === 0
        ? "complete"
        : "incomplete",
    coverageGapDetected: patchResult.semanticValidation.coverageGapDetected,
    execution,
    failureStages,
    genericFallbackDetected: patchResult.semanticValidation.genericFallbackDetected,
    mentionedFiles: patchResult.semanticValidation.mentionedFiles,
    missingRequestedFiles: patchResult.semanticValidation.missingRequestedFiles,
    requiresHostReview: !patchResult.inspection.ok,
    resultStatus: patchResult.semanticValidation.resultStatus,
    skippedFiles: patchResult.semanticValidation.skippedFiles,
    reasons: uniqueReasons,
    structuredFailureKind: structuredOutputOk ? null : "schema-validation",
    structuredOutputAttempts: 1,
    structuredOutputOk,
    structuredOutputStatus: structuredOutputOk ? "valid" : "invalid",
    templateFallbackDetected: patchResult.semanticValidation.templateFallbackDetected,
    workflowStatus: patchResult.inspection.ok ? "completed" : "needs_review"
  };
  const workerResult: AgentResult = {
    taskId: patchResult.proposal.id,
    agentId: "worker.patch-generation",
    role: "worker",
    status: patchResult.inspection.ok ? "success" : "needs_review",
    output: patchResult.proposal,
    confidence: patchResult.inspection.ok ? 0.76 : 0.42,
    risks: [
      ...patchResult.proposal.risks,
      ...uniqueReasons
    ],
    artifacts: [
      {
        name: `${patchResult.proposal.id}.patch`,
        type: "text/x-diff",
        content: patchResult.proposal.unifiedDiff
      }
    ],
    metadata: {
      inspection: patchResult.inspection,
      semanticValidation: patchResult.semanticValidation,
      structuredOutputOk,
      taskType: "patch-generation"
    }
  };
  const finalResult: AgentResult = {
    taskId: patchResult.proposal.id,
    agentId: "host-worker.finalizer",
    role: "reviewer",
    status: patchResult.inspection.ok ? "success" : "needs_review",
    output: {
      execution,
      inspection: patchResult.inspection,
      proposal: patchResult.proposal,
      qualityGate,
      repositoryContext: {
        scope: repositoryContext.scope,
        requestedFiles: repositoryContext.requestedFiles,
        skippedFiles: repositoryContext.skippedFiles,
        coverageGapDetected: repositoryContext.coverageGapDetected,
        selectedFiles: repositoryContext.selectedFiles.map((file) => file.path),
        strictFiles: repositoryContext.strictFiles
      }
    },
    confidence: patchResult.inspection.ok ? 0.76 : 0.42,
    risks: uniqueReasons,
    artifacts: workerResult.artifacts,
    metadata: {
      patchProposalId: patchResult.proposal.id,
      taskType: "patch-generation",
      workerId: resolvedWorkerId
    }
  };

  return {
    debug: {
      qualityGate: {
        answerStatus: qualityGate.answerStatus,
        coverageGapDetected: qualityGate.coverageGapDetected,
        execution: qualityGate.execution,
        failureStages: qualityGate.failureStages,
        reasons: qualityGate.reasons,
        resultStatus: qualityGate.resultStatus,
        structuredFailureKind: qualityGate.structuredFailureKind,
        structuredOutputAttempts: qualityGate.structuredOutputAttempts,
        structuredOutputOk: qualityGate.structuredOutputOk,
        structuredOutputStatus: qualityGate.structuredOutputStatus,
        workflowStatus: qualityGate.workflowStatus
      },
      promptTransparency: {
        hostPrompt: input.goal,
        promptTransformation: "augmented",
        workerPrompt: null
      },
      repositoryContext: {
        requestedFiles: repositoryContext.requestedFiles,
        skippedFiles: repositoryContext.skippedFiles,
        scope: repositoryContext.scope,
        selectedFiles: repositoryContext.selectedFiles.map((file) => file.path),
        coverageGapDetected: repositoryContext.coverageGapDetected,
        strictFiles: repositoryContext.strictFiles,
        warnings: repositoryContext.warnings
      },
      workerExecution: execution,
      worker: {
        artifacts: workerResult.artifacts,
        metadata: workerResult.metadata,
        output: workerResult.output,
        status: workerResult.status
      }
    },
    execution,
    errors: [],
    finalResult,
    qualityGate,
    repositoryContext,
    warnings: [
      ...repositoryContext.warnings,
      ...patchResult.warnings
    ],
    workerCapabilityProfile: null,
    workerResult
  };
};

export const runHostWorkerWorkflow = async (
  input: HostWorkerWorkflowInput
): Promise<HostWorkerWorkflowOutput> => {
  if (input.taskType === "patch-generation") {
    return runPatchGenerationThroughHostWorker(input);
  }

  const context = input.context ?? await resolveExecutionContext();
  const resolvedWorker = await resolveWorkflowWorkerContext({
    activity: "host-managed worker execution",
    context,
    requireProfile: input.requireProfile,
    workerId: input.workerId
  });
  const resolvedWorkerId = resolvedWorker.workerId;
  const workerContext = resolvedWorker.context;
  const repositoryContext =
    input.repositoryContext ??
    await buildRepositoryContextPack(context, {
      rootDir: context.rootDir,
      scope: input.scope,
      files: input.files,
      strictFiles: input.strictFiles
    });
  const hostAdapter = new CodexHostAdapter();
  const hostTask = hostAdapter.buildWorkerTask({
    additionalTaskInput: input.additionalTaskInput,
    context: workerContext,
    goal: input.goal,
    repositoryContext,
    taskId: input.taskId,
    taskType: input.taskType
  });
  const task = hostTask.task;
  const hostPrompt = input.goal;

  await writeAuditEvent(context, {
    actor: "workflow",
    action: "start",
    mode: context.dryRun ? "dry-run" : "execute",
    workflow: "host-worker-workflow",
    inputSummary: input.goal,
    outputSummary: "Host-managed worker workflow started.",
    warnings: repositoryContext.warnings,
    errors: [],
    metadata: {
      files: input.files ?? [],
      scope: repositoryContext.scope,
      taskType: input.taskType,
      workerId: resolvedWorkerId
    }
  });

  const { profile, warnings: profileWarnings } = await resolveProfile(
    input,
    workerContext,
    resolvedWorkerId
  );
  const eligibility = assessWorkerTaskEligibility(profile, input.taskType);
  const plannedTask = hostTask.plannedTask;
  const forceExecution = input.forceExecution === true;
  const overrideApplied = forceExecution && !eligibility.allowed;
  const execution: HostWorkerExecutionInfo = {
    allowedByPolicy: eligibility.allowed,
    forceExecution,
    overrideApplied,
    policyReason: eligibility.reason,
    requiresHostReview:
      eligibility.requiresHostReview || overrideApplied,
    state: eligibility.allowed || overrideApplied
      ? "executed"
      : "blocked_by_policy"
  };
  const workerTrustProfile = buildWorkerTrustProfile({
    eligibilityAllowed: eligibility.allowed,
    forceExecution,
    profile,
    profileWarnings,
    taskType: input.taskType
  });

  let workerResult: AgentResult | null = null;
  let permissionRequest:
    | {
        decision: WorkerToolPermissionDecision;
        request: WorkerToolRequest;
      }
    | undefined;
  const warnings = [
    ...repositoryContext.warnings,
    ...profileWarnings
  ];
  const errors: string[] = [];

  if (!eligibility.allowed && !overrideApplied) {
    warnings.push(eligibility.reason);
  } else {
    if (overrideApplied) {
      warnings.push(
        `Policy override enabled for ${profile.workerId}; executing ${input.taskType} despite routing warning: ${eligibility.reason}`
      );
    }
    const worker = resolveWorkerAgent(input.taskType, workerContext);
    const toolLoop = await runWorkerWithToolLoop({
      allowUnqualifiedExecution: overrideApplied,
      baseTask: task,
      context,
      hostTask,
      notes: [
        `Task type: ${input.taskType}`,
        `Requested files: ${(input.files ?? []).join(", ") || "none"}`,
        `Selected files: ${repositoryContext.selectedFiles.map((file) => file.path).join(", ") || "none"}`
      ],
      plannedTask,
      repositoryContext,
      userPermissionGrants: input.userPermissionGrants,
      worker,
      workerProfile: profile
    });
    workerResult = toolLoop.workerResult;
    permissionRequest = toolLoop.permissionRequest;
  }

  const qualityGate = buildQualityGate(
    input,
    repositoryContext,
    execution,
    workerResult
  );
  const resultEnvelope = buildWorkerResultEnvelope({
    execution,
    qualityGate,
    taskEnvelopeId: hostTask.envelope.id,
    taskType: input.taskType,
    workerResult
  });
  const executionRecord = await recordWorkerTaskExecution(context, {
    artifactRefs: workerResult?.artifacts.map((artifact) => artifact.name) ?? [],
    diagnostics: {
      execution,
      qualityGate,
      workflow: "host-worker-workflow"
    },
    resultEnvelope,
    taskEnvelope: hostTask.envelope,
    workerId: profile.workerId,
    workerTrustProfile
  });
  if (!qualityGate.answered) {
    warnings.push(...qualityGate.reasons);
  }
  if (permissionRequest) {
    warnings.push(permissionRequest.decision.reason);
  }

  const runSucceeded =
    execution.state === "executed" &&
    qualityGate.workflowStatus === "completed" &&
    qualityGate.answered &&
    !qualityGate.requiresHostReview &&
    workerResult?.status === "success";
  const finalResult: AgentResult = {
    taskId: task.id,
    agentId: "host-worker.finalizer",
    role: "reviewer",
    status: runSucceeded ? "success" : "needs_review",
    output: {
      execution,
      qualityGate,
      repositoryContext: {
        scope: repositoryContext.scope,
        requestedFiles: repositoryContext.requestedFiles,
        skippedFiles: repositoryContext.skippedFiles,
        coverageGapDetected: repositoryContext.coverageGapDetected,
        selectedFiles: repositoryContext.selectedFiles.map((file) => file.path),
        strictFiles: repositoryContext.strictFiles
      },
      worker: workerResult?.output ?? null,
      permissionRequest
    },
    confidence:
      runSucceeded && workerResult
        ? workerResult.confidence
        : 0.42,
    risks: [
      ...(workerResult?.risks ?? []),
      ...qualityGate.reasons
    ],
    artifacts: workerResult?.artifacts ?? [],
    metadata: {
      executionState: execution.state,
      forceExecution: execution.forceExecution,
      overrideApplied: execution.overrideApplied,
      taskType: input.taskType,
      workerExecutionRecordId: executionRecord.record.id,
      workerId: profile.workerId,
      workerTrustProfile,
      permissionRequest
    }
  };

  await writeAuditEvent(context, {
    actor: "workflow",
    action: "complete",
    mode: context.dryRun ? "dry-run" : "execute",
    workflow: "host-worker-workflow",
    inputSummary: input.goal,
    outputSummary: `Host-managed worker workflow completed with status ${finalResult.status}.`,
    warnings,
    errors,
    metadata: {
      answered: qualityGate.answered,
      scope: repositoryContext.scope,
      taskType: input.taskType,
      workerExecutionRecordId: executionRecord.record.id,
      workerExecutionRecordWritten: executionRecord.written,
      workerId: profile.workerId
    }
  });

  return {
    debug: {
      qualityGate: {
        answerStatus: qualityGate.answerStatus,
        coverageGapDetected: qualityGate.coverageGapDetected,
        execution: qualityGate.execution,
        failureStages: qualityGate.failureStages,
        reasons: qualityGate.reasons,
        resultStatus: qualityGate.resultStatus,
        structuredFailureKind: qualityGate.structuredFailureKind,
        structuredOutputAttempts: qualityGate.structuredOutputAttempts,
        structuredOutputOk: qualityGate.structuredOutputOk,
        structuredOutputStatus: qualityGate.structuredOutputStatus,
        workflowStatus: qualityGate.workflowStatus
      },
      promptTransparency: {
        hostPrompt,
        promptTransformation: hostTask.promptTransformation,
        workerPrompt:
          typeof workerResult?.metadata.prompt === "string"
            ? workerResult.metadata.prompt
            : null
      },
      repositoryContext: {
        requestedFiles: repositoryContext.requestedFiles,
        skippedFiles: repositoryContext.skippedFiles,
        scope: repositoryContext.scope,
        selectedFiles: repositoryContext.selectedFiles.map((file) => file.path),
        coverageGapDetected: repositoryContext.coverageGapDetected,
        strictFiles: repositoryContext.strictFiles,
        warnings: repositoryContext.warnings
      },
      workerExecution: execution,
      worker: workerResult
        ? {
            artifacts: workerResult.artifacts,
            metadata: workerResult.metadata,
            output: workerResult.output,
            status: workerResult.status
          }
        : null
    },
    execution,
    errors,
    finalResult,
    qualityGate,
    repositoryContext,
    warnings,
    workerCapabilityProfile: profile,
    workerResult
  };
};
