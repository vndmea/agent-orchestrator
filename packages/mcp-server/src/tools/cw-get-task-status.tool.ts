import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import {
  formatTaskSessionStatusOutput,
  getTaskSessionStatus
} from "@mcp-code-worker/graph";

import type { CwToolDefinition } from "./tool-types.js";
import {
  resolveWorkflowOutputOptions,
  workflowOutputOptionShape
} from "./output-options.js";

const inputSchema = z.object({
  taskId: z.string().min(1),
  ...workflowOutputOptionShape
});

export const cwGetTaskStatusTool: CwToolDefinition<
  typeof inputSchema.shape,
  ReturnType<typeof formatTaskSessionStatusOutput>
> = {
  name: "cw_get_task_status",
  description: "Get the current persisted state for one local task session.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    const session = await getTaskSessionStatus(
      context.rootDir,
      args.taskId,
      context.cwStorageDir
    );
    return formatTaskSessionStatusOutput(session, resolveWorkflowOutputOptions(args));
  }
};
