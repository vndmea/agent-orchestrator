import type { ExecutionContext } from "@agent-orchestrator/core";
import { AgentError, createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { runCommand, type RunCommandResult } from "./run-command.js";

export interface SafeCommandResult extends RunCommandResult {
  mode: "execute" | "dry-run";
}

const splitCommand = (command: string) => {
  const parts = command.trim().split(/\s+/u).filter(Boolean);
  return {
    command: parts[0] ?? "",
    args: parts.slice(1)
  };
};

export const runSafeCommand = async (
  commandLine: string,
  context: ExecutionContext = createExecutionContextFromEnv()
): Promise<SafeCommandResult> => {
  const evaluation = context.safetyPolicy.evaluateCommand(commandLine);

  if (!evaluation.allowed) {
    throw new AgentError("COMMAND_BLOCKED", evaluation.reason, {
      command: commandLine
    });
  }

  if (evaluation.mode === "dry-run") {
    return {
      code: 0,
      mode: "dry-run",
      stdout: "",
      stderr: ""
    };
  }

  const parsed = splitCommand(commandLine);
  const result = await runCommand(parsed.command, parsed.args, context.rootDir);

  return {
    ...result,
    mode: "execute"
  };
};
