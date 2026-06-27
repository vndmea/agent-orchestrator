import type {
  WorkerCapabilityProfile,
  WorkerTaskType
} from "@mcp-code-worker/core";

export interface WorkerTaskEligibility {
  allowed: boolean;
  reason: string;
  requiresHostReview: boolean;
}

export const assessWorkerTaskEligibility = (
  profile: WorkerCapabilityProfile,
  taskType: WorkerTaskType
): WorkerTaskEligibility => {
  if (profile.status === "blocked") {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is blocked by onboarding evaluation.`,
      requiresHostReview: true
    };
  }

  if (!profile.supportedTaskTypes.includes(taskType)) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not qualified for ${taskType} tasks.`,
      requiresHostReview: true
    };
  }

  const repoGrounding = profile.portrait?.repoGrounding ?? 0;
  const scopeDiscipline = profile.portrait?.scopeDiscipline ?? 0;
  const answerDirectness = profile.portrait?.answerDirectness ?? 0;
  const codeUnderstandingScore = profile.taskScores?.codeUnderstanding ?? 0;
  const riskAnalysisScore = profile.taskScores?.riskAnalysis ?? 0;
  const reviewLiteScore = profile.taskScores?.reviewLite ?? 0;
  const summarizationScore = profile.taskScores?.summarization ?? 0;
  const validationFixScore = profile.taskScores?.validationFix ?? 0;
  const docGenerationScore = profile.taskScores?.docGeneration ?? 0;
  const hasGenericAnswerEvidence =
    (profile.evidence?.genericAnswerCases.length ?? 0) > 0;
  const hasFallbackPatternEvidence =
    (profile.evidence?.fallbackPatternCases.length ?? 0) > 0;

  if (
    (taskType === "review-lite" || taskType === "risk-analysis") &&
    (
      (taskType === "review-lite" ? reviewLiteScore : riskAnalysisScore) < 0.76 ||
      repoGrounding < 0.72 ||
      scopeDiscipline < 0.76 ||
      answerDirectness < 0.72 ||
      hasGenericAnswerEvidence ||
      hasFallbackPatternEvidence
    )
  ) {
    return {
      allowed: false,
      reason:
        `Worker ${profile.workerId} is not qualified for ${taskType} tasks because repo-grounded review discipline is below the routing threshold.`,
      requiresHostReview: true
    };
  }

  if (
    (taskType === "summarization" ||
      taskType === "log-analysis" ||
      taskType === "json-extraction" ||
      taskType === "doc-generation") &&
    (
      (taskType === "doc-generation" ? docGenerationScore : summarizationScore) < 0.74 ||
      repoGrounding < 0.7 ||
      scopeDiscipline < 0.72 ||
      hasGenericAnswerEvidence ||
      hasFallbackPatternEvidence
    )
  ) {
    return {
      allowed: false,
      reason:
        `Worker ${profile.workerId} is not qualified for ${taskType} tasks because repository-grounded summarization discipline is below the routing threshold.`,
      requiresHostReview: true
    };
  }

  if (
    taskType === "code-understanding" &&
    (
      codeUnderstandingScore < 0.72 ||
      (profile.portrait?.codeUnderstanding ?? 0) < 0.7 ||
      repoGrounding < 0.68 ||
      hasGenericAnswerEvidence
    )
  ) {
    return {
      allowed: false,
      reason:
        `Worker ${profile.workerId} is not qualified for code-understanding tasks because repository-grounded code comprehension is below the routing threshold.`,
      requiresHostReview: true
    };
  }

  if (taskType === "codegen" && !profile.routingPolicy.allowCodegen) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not allowed to perform code generation.`,
      requiresHostReview: true
    };
  }

  if (
    taskType === "validation-fix" &&
    (
      !profile.routingPolicy.allowCodegen ||
      (profile.taskScores?.codegen ?? 0) < 0.76 ||
      (profile.score.codeQuality ?? 0) < 0.74 ||
      (profile.portrait?.implementationPlanning ?? 0) < 0.72 ||
      validationFixScore < 0.76
    )
  ) {
    return {
      allowed: false,
      reason:
        `Worker ${profile.workerId} is not qualified for validation-fix tasks because implementation quality is below the routing threshold.`,
      requiresHostReview: true
    };
  }

  if (
    taskType === "test-generation" &&
    !profile.supportedTaskTypes.includes("test-generation")
  ) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not allowed to generate tests.`,
      requiresHostReview: true
    };
  }

  if (
    taskType === "patch-generation" &&
    !profile.routingPolicy.allowPatchGeneration
  ) {
    return {
      allowed: false,
      reason: `Worker ${profile.workerId} is not allowed to generate patch proposals.`,
      requiresHostReview: true
    };
  }

  return {
    allowed: true,
    reason: `Worker ${profile.workerId} is qualified for ${taskType}.`,
    requiresHostReview: profile.routingPolicy.requiresHostReview
  };
};
