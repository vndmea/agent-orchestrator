import type {
  WorkerCapabilityProfile,
  WorkerTaskType
} from "@agent-orchestrator/core";

export interface WorkerTaskEligibility {
  allowed: boolean;
  reason: string;
  requiresLeaderReview: boolean;
}

export const assessWorkerTaskEligibility = (
  profile: WorkerCapabilityProfile,
  taskType: WorkerTaskType
): WorkerTaskEligibility => {
  if (profile.status === "blocked") {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is blocked by onboarding evaluation.`,
      requiresLeaderReview: true
    };
  }

  if (!profile.supportedTaskTypes.includes(taskType)) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not qualified for ${taskType} tasks.`,
      requiresLeaderReview: true
    };
  }

  if (taskType === "codegen" && !profile.routingPolicy.allowCodegen) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not allowed to perform code generation.`,
      requiresLeaderReview: true
    };
  }

  if (
    taskType === "test-generation" &&
    !profile.supportedTaskTypes.includes("test-generation")
  ) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not allowed to generate tests.`,
      requiresLeaderReview: true
    };
  }

  return {
    allowed: true,
    reason: `Worker ${profile.workerId} is qualified for ${taskType}.`,
    requiresLeaderReview: profile.routingPolicy.requiresLeaderReview
  };
};
