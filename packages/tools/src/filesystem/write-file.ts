import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ExecutionContext } from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

export interface WriteFileResult {
  mode: "execute" | "dry-run";
  path: string;
  written: boolean;
}

export const writeRepositoryFile = async (
  path: string,
  content: string,
  context: ExecutionContext = createExecutionContextFromEnv(),
  explicitAllowWrite = false
): Promise<WriteFileResult> => {
  const evaluation = context.writePolicy.evaluate(path, explicitAllowWrite);

  if (evaluation.mode === "dry-run") {
    return {
      mode: evaluation.mode,
      path,
      written: false
    };
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");

  return {
    mode: evaluation.mode,
    path,
    written: true
  };
};
