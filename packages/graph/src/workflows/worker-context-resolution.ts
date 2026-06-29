import {
  createExecutionContextWithWorkerModel,
  type ExecutionContext
} from "@mcp-code-worker/core";
import {
  requireConfiguredWorkerId,
  resolveWorkerProfile,
  resolveWorkerTarget
} from "@mcp-code-worker/models";

export interface ResolvedWorkflowWorkerContext {
  context: ExecutionContext;
  requestedWorkerId: string;
  workerId: string;
}

export const resolveWorkflowWorkerContext = async (input: {
  activity: string;
  baseURL?: string;
  context: ExecutionContext;
  model?: string;
  provider?: string;
  requireProfile?: boolean;
  workerId?: string;
}): Promise<ResolvedWorkflowWorkerContext> => {
  const requestedWorkerId = requireConfiguredWorkerId(
    input.context,
    input.workerId,
    input.activity
  );
  const resolvedTarget = await resolveWorkerTarget({
    context: input.context,
    workerId: requestedWorkerId,
    provider: input.provider,
    model: input.model,
    baseURL: input.baseURL
  });
  const workerContext = createExecutionContextWithWorkerModel(
    input.context,
    resolvedTarget.modelConfig
  );

  if (input.requireProfile) {
    await resolveWorkerProfile({
      context: workerContext,
      workerId: resolvedTarget.workerId,
      modelConfig: workerContext.workerModel,
      requireProfile: input.requireProfile
    });
  }

  return {
    context: workerContext,
    requestedWorkerId,
    workerId: resolvedTarget.workerId
  };
};
