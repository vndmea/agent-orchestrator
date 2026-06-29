export {
  runSetup,
  type SetupOptions,
  type SetupResult,
  type SetupStepResult,
  type SetupStepStatus,
  type SetupWorkerPlan,
  type SetupWorkerSummary
} from "@mcp-code-worker/graph";

import type { SetupResult } from "@mcp-code-worker/graph";

export const formatSetupResult = (result: SetupResult): string[] => {
  const unavailableSteps = result.steps.filter((step) => step.status === "unavailable");
  const needsInputSteps = result.steps.filter((step) => step.status === "needs-input");

  const lines: string[] = [
    `cw init: ${result.status}`,
    result.summary,
    `workspace: ${result.rootDir}`,
    `mode: ${result.mode}`,
    `steps: ${result.steps
      .map((step) => `${step.id}=${step.status}`)
      .join(", ")}`
  ];

  if (unavailableSteps.length > 0) {
    lines.push(
      `unavailable: ${unavailableSteps
        .slice(0, 3)
        .map((step) => step.summary)
        .join(" | ")}`
    );
  }

  if (needsInputSteps.length > 0) {
    lines.push(
      `attention: ${needsInputSteps
        .slice(0, 3)
        .map((step) => step.summary)
        .join(" | ")}`
    );
  }

  if (result.recommendedConfig.length > 0) {
    lines.push(`config: ${result.recommendedConfig.join(", ")}`);
  }

  if (result.recommendedActions.length > 0) {
    lines.push(`next: ${result.recommendedActions.slice(0, 3).join(" | ")}`);
  }

  return lines;
};
