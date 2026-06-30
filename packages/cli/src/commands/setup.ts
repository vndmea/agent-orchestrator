import { homedir } from "node:os";
import { resolve } from "node:path";

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

import { formatDisplayPath } from "../output.js";

export const formatSetupResult = (
  result: SetupResult & {
    codexMcpConfig?: {
      exists?: boolean;
      status: "missing-file" | "not-requested" | "written";
    };
  }
): string[] => {
  const unavailableSteps = result.steps.filter((step) => step.status === "unavailable");
  const needsInputSteps = result.steps.filter((step) => step.status === "needs-input");
  const codexConfigPath = formatDisplayPath(
    result.rootDir,
    resolve(homedir(), ".codex", "config.toml")
  );
  const codexConfigSummary =
    result.codexMcpConfig?.status === "written"
      ? "updated via explicit opt-in"
      : result.codexMcpConfig?.status === "missing-file"
        ? "not found; create it manually and paste cw mcp config --host codex"
        : result.codexMcpConfig?.exists === false
          ? "not detected; create it manually only if Codex is your host"
        : "cw mcp config --host codex";

  const lines: string[] = [
    `cw init: ${result.status}`,
    result.summary,
    `workspace: ${result.rootDir}`,
    `mode: ${result.mode}`,
    `steps: ${result.steps
      .map((step) => `${step.id}=${step.status}`)
      .join(", ")}`,
    `codex host config: ${codexConfigPath} | ${codexConfigSummary}`
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
